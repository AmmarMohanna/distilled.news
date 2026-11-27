import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {catchUpSummaryPort} from './catch-up-summary-provider';
import {generateCatchUpSummary,CatchUpSummaryResourceWait,catchUpSummaryRequest} from './catch-up-summary';
import type {Env} from './types';
import {authorizeModelSpending,READER_CATCH_UP_RESERVATION_PREFIX,reserveModelSpending,settleModelSpending} from './v1-intelligence/model-spending';
import {recoverProviderGeneration} from './v1-intelligence/provider-recovery';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('summary-test',JSON.stringify({revision:1,paused:true})).run();});
afterAll(async()=>ctx?.dispose());
const text='Officials proposed a change, subject to approval.';
const input={language:'en',briefings:[{id:'one',publishedAt:'2026-10-26T12:00:00Z',stories:[{id:'one:story',title:'',summary:text,sources:[]}]}]};
const summaryResponse=(cost=.0001)=>Response.json({choices:[{message:{content:JSON.stringify({sentences:[{text,storyIds:['one:story']}]})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost}});
const config=()=>({DB:ctx.db,OPENROUTER_API_KEY:'test-only'} as Env);
// Other tests deliberately leave unresolved operations in this database.
const refusalConfig=()=>({...config(),V1_PROVIDER_MAX_CONCURRENCY:'6',V1_PROVIDER_REQUESTS_PER_MINUTE:'1000'});
it('reserves before inference, settles reported cost and reuses its immutable receipt',async()=>{
 const fetcher=vi.fn(async()=>{const held=await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_model_spending_reservations WHERE feed_id='summary-test'").first<{n:number}>();expect(held!.n).toBe(1);return summaryResponse();});
 const port=catchUpSummaryPort(config(),'summary-test','reader',fetcher);
 const first=await port.complete(catchUpSummaryRequest(input));expect(first.costUsd).toBe(.0001);
 expect(await port.complete(catchUpSummaryRequest(input))).toEqual(first);expect(fetcher).toHaveBeenCalledOnce();
 const result=await generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port});expect(result.status).toBe('ready');
 expect(await generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port})).toEqual(result);expect(fetcher).toHaveBeenCalledOnce();
});
it('does not resubmit an uncertain provider request',async()=>{
 const fetcher=vi.fn(async()=>{throw new TypeError('connection lost');});const port=catchUpSummaryPort(config(),'summary-test','uncertain-reader',fetcher);
 await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow();await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});
it('blocks unknown-cost responses without releasing or retrying the operation',async()=>{
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A change was proposed."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));const port=catchUpSummaryPort(config(),'summary-test','missing-cost',fetcher);
 await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('usage could not be confirmed');await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});

it('preserves holds and returns pending when provider slots are full, without sending inference',async()=>{
 const fetcher=vi.fn(async()=>{throw Error('MUST_NOT_SEND');});const port=catchUpSummaryPort({...config(),V1_PROVIDER_MAX_CONCURRENCY:'1'},'summary-test','capacity-reader',fetcher);
 const before=await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations').first();
 await expect(port.complete(catchUpSummaryRequest(input))).rejects.toBeInstanceOf(CatchUpSummaryResourceWait);
 expect(await generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId:'capacity-reader',input,port})).toEqual({status:'pending'});
 expect(fetcher).not.toHaveBeenCalled();expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations').first()).toEqual(before);
});

it('leaves the last shared slot available for a scheduled briefing',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  const env={DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env;
  for(const id of ['feed-0','feed-1','feed-2','other-feed','fourth-feed'])await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>{throw new TypeError('response lost')});
  await Promise.allSettled(['reader-1','reader-2','reader-3'].map((reader,i)=>catchUpSummaryPort(env,'feed-'+i,reader,fetcher).complete(catchUpSummaryRequest(input))));
  expect(fetcher).toHaveBeenCalledTimes(2);
  const now=new Date().toISOString();
  await expect(reserveModelSpending(local.db,{id:'scheduled',accountId:'test-only-account',feedId:'other-feed',token:'scheduled',model:'openai/gpt-4.1',reservedCostUsd:.01,leaseUntil:Date.now()+60000,createdAt:now,providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:20}})).resolves.toBeUndefined();
  await expect(catchUpSummaryPort(env,'fourth-feed','fourth-reader',fetcher).complete(catchUpSummaryRequest(input))).rejects.toBeInstanceOf(CatchUpSummaryResourceWait);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await local.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())?.n).toBe(3);
 }finally{await local.dispose()}
},30000);

it('retains summary generation identity for metadata-only recovery when billed cost is missing',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('recovery-feed',JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>Response.json({id:'gen-summary-recovery',choices:[{message:{content:'{"summary":"A change was proposed."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));
  const port=catchUpSummaryPort({DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env,'recovery-feed','reader',fetcher);
  await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('usage could not be confirmed');
  const row=await local.db.prepare('SELECT id FROM v1_model_spending_reservations').first<{id:string}>();
  const metadata=vi.fn(async(url:RequestInfo|URL)=>{expect(String(url)).toContain('/generation?id=gen-summary-recovery');return Response.json({data:{id:'gen-summary-recovery',model:'openai/gpt-4.1-mini',total_cost:.0003,finish_reason:'stop'}})});
  expect(await recoverProviderGeneration(local.db,row!.id,'test-only',metadata)).toEqual({state:'SETTLED',costUsd:.0003});
  expect(metadata).toHaveBeenCalledOnce();
  await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('could not be confirmed');
  expect(fetcher).toHaveBeenCalledOnce();
  expect((await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements WHERE id=?').bind(row!.id).first())).toMatchObject({reported:1,cost_usd:.0003});
 }finally{await local.dispose()}
},30000);

it('settles known usage before rejecting an unusable summary and never resends it',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('empty-feed',JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>Response.json({id:'gen-empty-summary',choices:[{message:{content:''},finish_reason:'stop'}],usage:{cost:.0002}}));
  const port=catchUpSummaryPort({DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env,'empty-feed','reader',fetcher);
  await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('empty model reply');
  expect(await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements').first()).toMatchObject({reported:1,cost_usd:.0002});
  await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('could not be confirmed');
  expect(fetcher).toHaveBeenCalledOnce();
 }finally{await local.dispose()}
},30000);


it('requires and enforces a finite grant even when the model account is in TRACK_ONLY mode',async()=>{
 const local=await createIntakeDatabase({product:true,modelSpending:false});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('tracking-feed',JSON.stringify({revision:1})).run();
  await local.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,'2026-11-16T00:00:00Z')").bind('model-spending:tracking-only:summary-account',JSON.stringify({mode:'TRACK_ONLY',modelIds:['*'],enabledAt:'2000-01-01T00:00:00Z'})).run();
  const env={DB:local.db,OPENROUTER_API_KEY:'test'} as Env;
  const fetcher=vi.fn(async()=>summaryResponse(.005));
  const port=catchUpSummaryPort(env,'tracking-feed','reader',fetcher);
  await expect(port.complete(catchUpSummaryRequest(input))).rejects.toThrow('temporarily unavailable');
  expect(fetcher).not.toHaveBeenCalled();
  expect(await local.db.prepare('SELECT id FROM v1_model_spending_reservations').first()).toBeNull();
  await authorizeModelSpending(local.db,{id:'finite-grant',accountId:'summary-account',modelIds:['*'],
    validFrom:'2000-01-01T00:00:00Z',validUntil:'2100-01-01T00:00:00Z',maxExposureUsd:.005,maxConcurrentOperations:2});
  const result=await port.complete(catchUpSummaryRequest(input));
  expect(await port.complete(catchUpSummaryRequest(input))).toEqual(result);expect(fetcher).toHaveBeenCalledOnce();
  expect(await local.db.prepare('SELECT account_id,authorization_id FROM v1_model_spending_reservations').first()).toEqual({account_id:'summary-account',authorization_id:'finite-grant'});
  expect(await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements').first()).toMatchObject({reported:1,cost_usd:.005});
  await expect(port.complete(catchUpSummaryRequest({...input,language:'fr'}))).rejects.toThrow('temporarily unavailable');
  expect(fetcher).toHaveBeenCalledOnce();
 }finally{await local.dispose()}
},30000);

it('keeps a lifetime cap for summaries separate from scheduled spending on the same account',async()=>{
 const local=await createIntakeDatabase({product:true,modelSpending:false});try{
  const feedId='lifetime-feed',accountId='shared-provider';
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(feedId,JSON.stringify({revision:1})).run();
  await local.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)')
   .bind('model-spending:tracking-only:'+accountId,JSON.stringify({mode:'TRACK_ONLY',modelIds:['*'],enabledAt:'2000-01-01T00:00:00Z'}),'2026-01-01T00:00:00Z').run();
  await reserveModelSpending(local.db,{id:'scheduled-test',accountId,feedId,token:'scheduled',model:'openai/gpt-4.1-mini',
   reservedCostUsd:1,leaseUntil:Date.now()+60_000,createdAt:new Date().toISOString()});
  await settleModelSpending(local.db,'scheduled-test','scheduled',{costUsd:1,reported:true});

  const env={DB:local.db,OPENROUTER_API_KEY:'test',CATCH_UP_LIFETIME_LIMIT_USD:'.005'} as Env;
  const fetcher=vi.fn(async()=>summaryResponse(.005));
  const port=catchUpSummaryPort(env,feedId,'first-reader',fetcher);
  const request=catchUpSummaryRequest(input);
  expect(await port.complete(request)).toMatchObject({costUsd:.005});
  expect(await port.complete(request)).toMatchObject({costUsd:.005});
  const other=catchUpSummaryPort(env,feedId,'second-reader',fetcher);
  await expect(other.complete(request)).rejects.toThrow('temporarily unavailable');
  expect(fetcher).toHaveBeenCalledOnce();
  const {results}=await local.db.prepare('SELECT authorization_id FROM v1_model_spending_reservations ORDER BY id').all();
  expect(results).toEqual([{authorization_id:'reader-catch-up-lifetime'},{authorization_id:null}]);

  const reserve=(key:string)=>reserveModelSpending(local.db,{
   id:READER_CATCH_UP_RESERVATION_PREFIX+key,accountId,feedId,token:key,model:'openai/gpt-4.1-mini',
   reservedCostUsd:.004,leaseUntil:Date.now()+60_000,createdAt:new Date().toISOString()
  },{requireAuthorization:true,catchUpLifetimeLimitUsd:.011});
  const concurrent=await Promise.allSettled([reserve('race-a'),reserve('race-b')]);
  expect(concurrent.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  await expect(reserve('still-held')).rejects.toThrow('ACCOUNT_RESOURCE_WAIT');
 }finally{await local.dispose()}
},30000);

it.each([429,503])('retries a confirmed HTTP %i once and reuses the successful result',async status=>{
 const accountId=`refused-${status}`;
 let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null,{status})).mockImplementationOnce(async()=>{await waiting;return summaryResponse();});
 const port=catchUpSummaryPort(refusalConfig(),'summary-test',accountId,fetcher);
 const run=()=>generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId,input,port});
 expect(await run()).toEqual({status:'pending'});
 expect(fetcher).toHaveBeenCalledOnce();
 const first=await ctx.db.prepare("SELECT id FROM v1_feed_documents WHERE kind='reader_catch_up_provider_refusal' AND json_extract(json,'$.httpStatus')=?").bind(status).first<{id:string}>();
 const retry=run();
 try {
  await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2),{timeout:5000});
  expect(await run()).toEqual({status:'pending'});
 } finally {release();}
 expect(await retry).toEqual({status:'ready',summary:text});
 expect(await run()).toEqual({status:'ready',summary:text});
 expect(fetcher).toHaveBeenCalledTimes(2);
 const rows=await ctx.db.prepare('SELECT id,reported,cost_usd FROM v1_model_spending_settlements WHERE id IN (?,?) ORDER BY id').bind(first!.id,`${first!.id}:2`).all();
 expect(rows.results).toEqual([{id:first!.id,reported:1,cost_usd:0},{id:`${first!.id}:2`,reported:1,cost_usd:.0001}]);
},30000);

it('stops after three confirmed refusals and keeps every zero-cost settlement',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:429}));
 const port=catchUpSummaryPort(refusalConfig(),'summary-test','repeated-refusals',fetcher);
 const run=()=>generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId:'repeated-refusals',input,port});
 expect(await run()).toEqual({status:'pending'});
 expect(await run()).toEqual({status:'pending'});
 for(let i=0;i<2;i++)await expect(run()).rejects.toMatchObject({code:'SUMMARY_PROVIDER_REFUSED'});
 expect(fetcher).toHaveBeenCalledTimes(3);
},30000);

it('retains a hold when a refusal status also carries a generation identity',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:503,headers:{'x-generation-id':'gen-potentially-billed'}}));
 const accountId='refused-with-generation';
 const port=catchUpSummaryPort(refusalConfig(),'summary-test',accountId,fetcher);
 const run=()=>generateCatchUpSummary({db:ctx.db,feedId:'summary-test',accountId,input,port});
 for(let i=0;i<2;i++)await expect(run()).rejects.toMatchObject({code:'SUMMARY_OUTCOME_UNKNOWN'});
 const row=await ctx.db.prepare(`SELECT s.id AS settled FROM v1_feed_documents d
   LEFT JOIN v1_model_spending_settlements s ON s.id=json_extract(d.json,'$.reservationId')
   WHERE d.kind='model_provider_receipts' AND json_extract(d.json,'$.generationId')='gen-potentially-billed'`).first();
 expect(row).toEqual({settled:null});
 expect(fetcher).toHaveBeenCalledOnce();
},30000);

it('atomically caps distinct summary attempts across feeds while reusing paid receipts without quota',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  for(const id of ['quota-feed-a','quota-feed-b'])await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const env={DB:local.db,OPENROUTER_API_KEY:'test',V1_PROVIDER_MAX_CONCURRENCY:'6',V1_PROVIDER_REQUESTS_PER_MINUTE:'1000'} as Env;
  const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A proposal remains subject to approval."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.0001}}));
  const requests=Array.from({length:8},(_,i)=>catchUpSummaryRequest({...input,briefings:[{...input.briefings[0],id:'edition-'+i}]}));
  const results:PromiseSettledResult<unknown>[]=[];
  for(let i=0;i<5;i++)results.push({status:'fulfilled',value:await catchUpSummaryPort(env,i%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(requests[i])});
  results.push(...await Promise.allSettled(requests.slice(5).map((request,index)=>catchUpSummaryPort(env,(index+5)%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(request))));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(6);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(2);expect(fetcher).toHaveBeenCalledTimes(6);
  const count=()=>local.db.prepare("SELECT COUNT(*) n FROM auth_attempts WHERE key='same-reader' AND action='reader-catch-up-v1'").first<{n:number}>();
  expect((await count())?.n).toBe(6);
  const passed=results.findIndex(result=>result.status==='fulfilled');
  await catchUpSummaryPort(env,passed%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(requests[passed]);
  expect(fetcher).toHaveBeenCalledTimes(6);expect((await count())?.n).toBe(6);
  // Another account has its own quota; advancing the retained attempt timestamps reopens the hour.
  await catchUpSummaryPort(env,'quota-feed-a','other-reader',fetcher).complete(requests[0]);
  await local.db.prepare("UPDATE auth_attempts SET created_at='2000-01-01T00:00:00Z' WHERE key='same-reader'").run();
  await catchUpSummaryPort(env,'quota-feed-a','same-reader',fetcher).complete(catchUpSummaryRequest({...input,language:'fr'}));
  expect(fetcher).toHaveBeenCalledTimes(8);
 }finally{await local.dispose()}
},30000);
