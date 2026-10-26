import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DurableProviderHttp,R2SourcePayloadStore,sourceSqlFromD1,reconcileCompletedZyteResponse,type SourceScope} from '@distilled/connectors';
import {createIntakeDatabase} from './v1-intake/test-utils';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,http:DurableProviderHttp,store:R2SourcePayloadStore;
let dispatch:ReturnType<typeof vi.fn>;
const scope:SourceScope={feedId:'feed-1',feedSourceId:'approved-1',sourceId:'canonical-1'};
const other:SourceScope={...scope,feedSourceId:'approved-2',sourceId:'canonical-2'};
const url='https://api.twitterapi.io/twitter/user/last_tweets';
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});
 const objects=new Map<string,Uint8Array>();
 store=new R2SourcePayloadStore({put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes)},get:async(key:string)=>{const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer}:null}} as never);
 dispatch=vi.fn(async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}}));
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch,4_000_000,20_000,15);
 await http.configureLimit('primary',100);await http.configureLimit('fallback',100);
});
afterEach(async()=>ctx?.dispose());
const send=(s:SourceScope,id:string,cost:number,provider='primary')=>http.request(s,id,provider,cost,url,{});
it('unlimited collection bypasses aggregate caps while retaining counters and paid replay',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch,4_000_000,20_000,1,{primary:1},{limitUsd:1,timeZone:'UTC'},{},false);
 await http.configureLimit('primary',1);
 await send(scope,'unlimited-1',.75);await send(scope,'unlimited-2',.75);await send(scope,'unlimited-1',.75);
 expect(dispatch).toHaveBeenCalledTimes(2);expect(await reserved(scope)).toBe(1.5);
 expect(await ctx.db.prepare("SELECT limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id='primary'").first()).toMatchObject({limit_usd:1,reserved_usd:1.5});
 expect(await ctx.db.prepare('SELECT limit_usd,reserved_usd FROM connector_daily_provider_budgets').first()).toMatchObject({limit_usd:1,reserved_usd:1.5});
});
it('unlimited collection still fences genuinely unknown paid outcomes',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch,4_000_000,20_000,1,{primary:1},undefined,{},false);
 await http.configureLimit('primary',1);dispatch.mockRejectedValueOnce(new Error('response lost'));
 await expect(send(scope,'unlimited-lost',2)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await expect(send(scope,'unlimited-later',2)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope)).toBe(2);
});
it('waits for an active paid request without marking competing jobs uncertain or reserving twice',async()=>{
 let finish!:(r:Response)=>void;dispatch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve}));
 const running=send(scope,'active-owner',1);await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledTimes(1));
 try{
  await expect(send(scope,'active-owner',1)).rejects.toMatchObject({code:'BACKPRESSURE'});
  await expect(send(scope,'different-job',1)).rejects.toMatchObject({code:'BACKPRESSURE'});
  expect(await reserved(scope)).toBe(1);expect(dispatch).toHaveBeenCalledTimes(1);
 }finally{finish(new Response('{"ok":true}'));await running;}
 await send(scope,'different-job',1);expect(dispatch).toHaveBeenCalledTimes(2);expect(await reserved(scope)).toBe(2);
});
it('an expired active claim remains uncertain and is never resubmitted',async()=>{
 let finish!:(r:Response)=>void;dispatch.mockImplementationOnce(()=>new Promise<Response>(resolve=>{finish=resolve}));
 const running=send(scope,'expired-owner',1);await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledTimes(1));
 const row=await ctx.db.prepare('SELECT operation_id,headers FROM connector_provider_operations LIMIT 1').first<{operation_id:string;headers:string}>(),headers=JSON.parse(row!.headers);
 await ctx.db.prepare('UPDATE connector_provider_operations SET headers=? WHERE operation_id=?').bind(JSON.stringify({...headers,claimExpiresAt:'2000-01-01T00:00:00Z'}),row!.operation_id).run();
 try{await expect(send(scope,'different-job',1)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});expect(dispatch).toHaveBeenCalledTimes(1);}
 finally{await ctx.db.prepare('UPDATE connector_provider_operations SET headers=? WHERE operation_id=?').bind(row!.headers,row!.operation_id).run();finish(new Response('{"ok":true}'));await running;}
});
async function reserved(s:SourceScope,provider='primary'){return (await ctx.db.prepare('SELECT reserved_usd FROM connector_source_provider_budgets WHERE feed_id=? AND feed_source_id=? AND provider_id=?').bind(s.feedId,s.feedSourceId,provider).first<{reserved_usd:number}>())?.reserved_usd??0}

it('authorizes fifteen dollars for primary and a separate fifteen for fallback on each source',async()=>{
 await send(scope,'primary-1',15);await send(scope,'fallback-1',15,'fallback');
 await expect(send(scope,'over-cap',0.01)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
 await send(other,'other-1',15);
 expect(await reserved(scope)).toBe(15);expect(await reserved(scope,'fallback')).toBe(15);expect(await reserved(other)).toBe(15);expect(dispatch).toHaveBeenCalledTimes(3);
});
it('replays without refilling usage and retains usage after configuration changes',async()=>{
 await send(scope,'same',10);await send(scope,'same',10);
 expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope)).toBe(10);
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch,4_000_000,20_000,12);
 expect(await reserved(scope)).toBe(10);
 await expect(send(scope,'too-large',3)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
});
it('atomically prevents concurrent different operations exceeding the source cap',async()=>{
 const outcomes=await Promise.allSettled([send(scope,'race-1',10),send(scope,'race-2',10)]);
 expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope)).toBe(10);
});
it('dispatches concurrent copies of one operation once and reserves once',async()=>{
 await Promise.allSettled([send(scope,'same-race',10),send(scope,'same-race',10)]);
 expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope)).toBe(10);
});
it('retains uncertain costs without charging an unrelated source or resubmitting',async()=>{
 dispatch.mockRejectedValueOnce(new Error('lost connection'));
 await expect(send(scope,'uncertain',10)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await expect(send(scope,'uncertain',10)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 expect(await reserved(scope)).toBe(10);expect(await reserved(other)).toBe(0);
 await send(other,'independent',15);expect(dispatch).toHaveBeenCalledTimes(2);
});
it('imports scoped legacy costs while retaining global provider reservations',async()=>{
 const legacy=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 await legacy.request(scope,'legacy', 'primary',10,url,{});
 await expect(send(scope,'extra',6)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
 expect(await reserved(scope)).toBe(10);expect(await reserved(other)).toBe(0);
 expect((await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='primary'").first())?.reserved_usd).toBe(10);
});
it('blocks new operations behind unattributed legacy uncertainty without inventing scope or repeating dispatch',async()=>{
 const legacy=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 dispatch.mockRejectedValueOnce(new Error('lost legacy connection'));
 await expect(legacy.request(scope,'legacy-unknown','primary',10,url,{})).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await ctx.db.prepare('UPDATE connector_provider_operations SET feed_id=NULL,feed_source_id=NULL WHERE payload_ref IS NULL').run();
 await expect(send(other,'over',6)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 expect((await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='primary'").first())?.reserved_usd).toBe(10);
 expect(dispatch).toHaveBeenCalledTimes(1);
});

it('an absent per-provider cap cannot bypass an unknown source submission through a later run or fallback',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 dispatch.mockRejectedValueOnce(new Error('lost response'));
 await expect(send(scope,'uncapped-unknown',1)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await expect(send(scope,'later-window',1)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await expect(send(scope,'other-provider',1,'fallback')).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await send(other,'independent-uncapped',1);
 expect(dispatch).toHaveBeenCalledTimes(2);
});
it('uncapped concurrent providers cannot reserve around another source submission in flight',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 let release!:()=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve});
 dispatch.mockImplementationOnce(async()=>{started();await new Promise<void>(resolve=>{release=resolve});return new Response('{"ok":true}');});
 const first=send(scope,'uncapped-first',1);await entered;
 try{await expect(send(scope,'uncapped-second',1,'fallback')).rejects.toMatchObject({code:'BACKPRESSURE'});}
 finally{release();await first;}
 expect(dispatch).toHaveBeenCalledTimes(1);
});

it('an absent per-provider cap still fences unattributed legacy uncertainty for its provider',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 dispatch.mockRejectedValueOnce(new Error('lost old response'));
 await expect(send(scope,'uncapped-legacy-unknown',1)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 await ctx.db.prepare('UPDATE connector_provider_operations SET feed_id=NULL,feed_source_id=NULL WHERE payload_ref IS NULL').run();
 await expect(send(other,'unattributed-later',1)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 expect(dispatch).toHaveBeenCalledTimes(1);
});
it('records bounded transport diagnostics without releasing an uncertain paid fence',async()=>{
 dispatch.mockRejectedValueOnce(new Error('private upstream information'));
 await expect(send(scope,'diagnostic',0.05)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 const row=await ctx.db.prepare('SELECT status,headers,payload_ref FROM connector_provider_operations').first<any>();
 expect(row.status).toBe(-1);expect(row.payload_ref).toBeNull();expect(JSON.parse(row.headers)).toMatchObject({failure:{phase:'RESPONSE_HEADERS',reason:'TRANSPORT'}});expect(row.headers).not.toContain('private upstream');
 await expect(send(scope,'diagnostic',0.05)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope)).toBe(0.05);
});
it('retains provider request identity when a response body fails',async()=>{
 dispatch.mockImplementationOnce(async()=>new Response(new ReadableStream({start(controller){controller.error(Error('body lost'))}}),{headers:{'zyte-request-id':'request-123'}}));
 await expect(send(scope,'body-loss',0.05)).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 const row=await ctx.db.prepare('SELECT status,headers,payload_ref FROM connector_provider_operations').first<any>();
 expect(row.payload_ref).toBeNull();expect(JSON.parse(row.headers)).toMatchObject({failure:{phase:'RESPONSE_BODY',reason:'TRANSPORT',httpStatus:200,requestId:'request-123'}});
});
it('supports a bounded longer deadline for Zyte without resubmission',async()=>{
 http=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch,4_000_000,1,15,undefined,undefined,{zyte:1000});await http.configureLimit('zyte',15);
 dispatch.mockImplementationOnce(async()=>{await new Promise(resolve=>setTimeout(resolve,20));return Response.json({ok:true})});
 expect((await http.request(scope,'longer-zyte','zyte',0.05,'https://api.zyte.com/v1/extract',{})).status).toBe(200);expect(dispatch).toHaveBeenCalledTimes(1);
});
it('operator-confirmed completion keeps its charge and never reissues its lost response',async()=>{
 const targetUrl='https://publisher.example/report',body=JSON.stringify({url:targetUrl,httpResponseBody:true,httpResponseHeaders:true}),api='https://api.zyte.com/v1/extract';await http.configureLimit('zyte',15);
 dispatch.mockRejectedValueOnce(Error('lost response'));
 await expect(http.request(scope,'lost','zyte',0.05,api,{method:'POST',body})).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 const op=await ctx.db.prepare('SELECT operation_id FROM connector_provider_operations').first<any>(),requestId='170d02a213082c0c04ccd96c5a16f5d8',providerTimestamp='2026-10-25T13:15:31.537000Z';
 const evidence={targetUrl,requestId,providerTimestamp,latencyMs:30753,evidenceUrl:`https://app.zyte.com/o/1031155/zyte-api/playground?requestId=${requestId}&timestamp=${providerTimestamp}&tab=overview`,confirmedBy:'operator:user-provided-receipt',confirmedAt:'2026-10-25T14:00:00Z'};
 await expect(reconcileCompletedZyteResponse(sourceSqlFromD1(ctx.db),scope,op.operation_id,{...evidence,targetUrl:'https://other.example/report'})).rejects.toThrow('COMPLETION_IDENTITY_MISMATCH');
 await reconcileCompletedZyteResponse(sourceSqlFromD1(ctx.db),scope,op.operation_id,evidence);await reconcileCompletedZyteResponse(sourceSqlFromD1(ctx.db),scope,op.operation_id,evidence);
 await expect(http.request(scope,'lost','zyte',0.05,api,{method:'POST',body})).rejects.toMatchObject({code:'RESULT_LOST'});expect(dispatch).toHaveBeenCalledTimes(1);expect(await reserved(scope,'zyte')).toBe(0.05);
 const original=await ctx.db.prepare('SELECT status,payload_ref FROM connector_provider_operations WHERE operation_id=?').bind(op.operation_id).first<any>();expect(original).toEqual({status:200,payload_ref:null});
 await http.request(scope,'different','zyte',0.05,api,{method:'POST',body:JSON.stringify({url:'https://publisher.example/another',httpResponseBody:true,httpResponseHeaders:true})});expect(dispatch).toHaveBeenCalledTimes(2);expect(await reserved(scope,'zyte')).toBe(0.1);
});
