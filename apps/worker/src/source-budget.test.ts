import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DurableProviderHttp,R2SourcePayloadStore,sourceSqlFromD1,type SourceScope} from '@distilled/connectors';
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
async function reserved(s:SourceScope){const key=await http.configureSourceLimit(s);return (await ctx.db.prepare('SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id=?').bind(key).first<{reserved_usd:number}>())!.reserved_usd}

it('shares fifteen dollars across primary and fallback and permits an independent source',async()=>{
 await send(scope,'primary-1',10);await send(scope,'fallback-1',5,'fallback');
 await expect(send(scope,'over-cap',0.01)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
 await send(other,'other-1',15);
 expect(await reserved(scope)).toBe(15);expect(await reserved(other)).toBe(15);expect(dispatch).toHaveBeenCalledTimes(3);
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
 expect(await reserved(scope)).toBe(10);expect(await reserved(other)).toBe(0);
 await expect(send(scope,'extra',6)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
 expect((await ctx.db.prepare("SELECT reserved_usd FROM connector_provider_budgets WHERE provider_id='primary'").first())?.reserved_usd).toBe(10);
});
it('conservatively holds unattributed legacy uncertain costs',async()=>{
 const legacy=new DurableProviderHttp(sourceSqlFromD1(ctx.db),store,dispatch);
 dispatch.mockRejectedValueOnce(new Error('lost legacy connection'));
 await expect(legacy.request(scope,'legacy-unknown','primary',10,url,{})).rejects.toMatchObject({code:'UNCERTAIN_PAID_SUBMISSION'});
 expect(await reserved(scope)).toBe(10);expect(await reserved(other)).toBe(10);
 await expect(send(other,'over',6)).rejects.toMatchObject({code:'BUDGET_EXCEEDED'});
 expect(dispatch).toHaveBeenCalledTimes(1);
});
