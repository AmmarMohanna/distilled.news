import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {unreadSummaryPort} from './unread-summary-provider';
import {generateUnreadSummary,UnreadSummaryResourceWait,unreadSummaryRequest} from './unread-summary';
import type {Env} from './types';
import {reserveModelSpending} from './v1-intelligence/model-spending';
import {recoverProviderGeneration} from './v1-intelligence/provider-recovery';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('summary-test',JSON.stringify({revision:1,paused:true})).run();});
afterAll(async()=>ctx?.dispose());
const input={language:'en',briefings:[{id:'one',publishedAt:'2026-10-26T12:00:00Z',text:'Officials proposed a change, subject to approval.'}]};
const config=()=>({DB:ctx.db,OPENROUTER_API_KEY:'test-only'} as Env);
it('reserves before inference, settles reported cost and reuses its immutable receipt',async()=>{
 const fetcher=vi.fn(async()=>{const held=await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_model_spending_reservations WHERE feed_id='summary-test'").first<{n:number}>();expect(held!.n).toBe(1);return Response.json({choices:[{message:{content:'{"summary":"Officials proposed a change, subject to approval."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.0001}});});
 const port=unreadSummaryPort(config(),'summary-test','reader',fetcher);
 const first=await port.complete(unreadSummaryRequest(input));expect(first.costUsd).toBe(.0001);
 expect(await port.complete(unreadSummaryRequest(input))).toEqual(first);expect(fetcher).toHaveBeenCalledOnce();
 const result=await generateUnreadSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port});expect(result.status).toBe('ready');
 expect(await generateUnreadSummary({db:ctx.db,feedId:'summary-test',accountId:'reader',input,port})).toEqual(result);expect(fetcher).toHaveBeenCalledOnce();
});
it('does not resubmit an uncertain provider request',async()=>{
 const fetcher=vi.fn(async()=>{throw new TypeError('connection lost');});const port=unreadSummaryPort(config(),'summary-test','uncertain-reader',fetcher);
 await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow();await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});
it('blocks unknown-cost responses without releasing or retrying the operation',async()=>{
 const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A change was proposed."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));const port=unreadSummaryPort(config(),'summary-test','missing-cost',fetcher);
 await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('usage could not be confirmed');await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');expect(fetcher).toHaveBeenCalledOnce();
});

it('preserves holds and returns pending when provider slots are full, without sending inference',async()=>{
 const fetcher=vi.fn(async()=>{throw Error('MUST_NOT_SEND');});const port=unreadSummaryPort({...config(),V1_PROVIDER_MAX_CONCURRENCY:'1'},'summary-test','capacity-reader',fetcher);
 const before=await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations').first();
 await expect(port.complete(unreadSummaryRequest(input))).rejects.toBeInstanceOf(UnreadSummaryResourceWait);
 expect(await generateUnreadSummary({db:ctx.db,feedId:'summary-test',accountId:'capacity-reader',input,port})).toEqual({status:'pending'});
 expect(fetcher).not.toHaveBeenCalled();expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations').first()).toEqual(before);
});

it('leaves the last shared slot available for a scheduled briefing',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  const env={DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env;
  for(const id of ['feed-0','feed-1','feed-2','other-feed','fourth-feed'])await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>{throw new TypeError('response lost')});
  await Promise.allSettled(['reader-1','reader-2','reader-3'].map((reader,i)=>unreadSummaryPort(env,'feed-'+i,reader,fetcher).complete(unreadSummaryRequest(input))));
  expect(fetcher).toHaveBeenCalledTimes(2);
  const now=new Date().toISOString();
  await expect(reserveModelSpending(local.db,{id:'scheduled',accountId:'test-only-account',feedId:'other-feed',token:'scheduled',model:'openai/gpt-4.1',reservedCostUsd:.01,leaseUntil:Date.now()+60000,createdAt:now,providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:20}})).resolves.toBeUndefined();
  await expect(unreadSummaryPort(env,'fourth-feed','fourth-reader',fetcher).complete(unreadSummaryRequest(input))).rejects.toBeInstanceOf(UnreadSummaryResourceWait);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await local.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())?.n).toBe(3);
 }finally{await local.dispose()}
},30000);

it('retains summary generation identity for metadata-only recovery when billed cost is missing',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('recovery-feed',JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>Response.json({id:'gen-summary-recovery',choices:[{message:{content:'{"summary":"A change was proposed."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20}}));
  const port=unreadSummaryPort({DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env,'recovery-feed','reader',fetcher);
  await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('usage could not be confirmed');
  const row=await local.db.prepare('SELECT id FROM v1_model_spending_reservations').first<{id:string}>();
  const metadata=vi.fn(async(url:RequestInfo|URL)=>{expect(String(url)).toContain('/generation?id=gen-summary-recovery');return Response.json({data:{id:'gen-summary-recovery',model:'openai/gpt-4.1-mini',total_cost:.0003,finish_reason:'stop'}})});
  expect(await recoverProviderGeneration(local.db,row!.id,'test-only',metadata)).toEqual({state:'SETTLED',costUsd:.0003});
  expect(metadata).toHaveBeenCalledOnce();
  await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');
  expect(fetcher).toHaveBeenCalledOnce();
  expect((await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements WHERE id=?').bind(row!.id).first())).toMatchObject({reported:1,cost_usd:.0003});
 }finally{await local.dispose()}
},30000);

it('settles known usage before rejecting an unusable summary and never resends it',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('empty-feed',JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>Response.json({id:'gen-empty-summary',choices:[{message:{content:''},finish_reason:'stop'}],usage:{cost:.0002}}));
  const port=unreadSummaryPort({DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env,'empty-feed','reader',fetcher);
  await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('empty model reply');
  expect(await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements').first()).toMatchObject({reported:1,cost_usd:.0002});
  await expect(port.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');
  expect(fetcher).toHaveBeenCalledOnce();
 }finally{await local.dispose()}
},30000);


it('uses TRACK_ONLY without an additional budget while retaining receipts and UNKNOWN fences',async()=>{
 const local=await createIntakeDatabase({product:true,modelSpending:false});try{
  await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('tracking-feed',JSON.stringify({revision:1})).run();
  await local.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,'2026-11-16T00:00:00Z')").bind('model-spending:tracking-only:summary-account',JSON.stringify({mode:'TRACK_ONLY',modelIds:['*'],enabledAt:'2000-01-01T00:00:00Z'})).run();
  const env={DB:local.db,OPENROUTER_API_KEY:'test'} as Env;
  const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A proposal remains subject to approval."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.0001}}));
  const port=unreadSummaryPort(env,'tracking-feed','reader',fetcher);
  const result=await port.complete(unreadSummaryRequest(input));
  expect(await port.complete(unreadSummaryRequest(input))).toEqual(result);expect(fetcher).toHaveBeenCalledOnce();
  expect(await local.db.prepare('SELECT account_id,authorization_id FROM v1_model_spending_reservations').first()).toEqual({account_id:'summary-account',authorization_id:null});
  expect(await local.db.prepare('SELECT reported,cost_usd FROM v1_model_spending_settlements').first()).toMatchObject({reported:1,cost_usd:.0001});
  const lost=vi.fn(async()=>{throw new TypeError('response lost')});
  const uncertain=unreadSummaryPort(env,'tracking-feed','other-reader',lost);
  await expect(uncertain.complete(unreadSummaryRequest(input))).rejects.toThrow();
  const holds=(await local.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results;
  await expect(uncertain.complete(unreadSummaryRequest(input))).rejects.toThrow('could not be confirmed');
  expect(lost).toHaveBeenCalledOnce();
  expect((await local.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results).toEqual(holds);
 }finally{await local.dispose()}
},30000);

it('atomically caps distinct summary attempts across feeds while reusing paid receipts without quota',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  for(const id of ['quota-feed-a','quota-feed-b'])await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const env={DB:local.db,OPENROUTER_API_KEY:'test',V1_PROVIDER_MAX_CONCURRENCY:'6',V1_PROVIDER_REQUESTS_PER_MINUTE:'1000'} as Env;
  const fetcher=vi.fn(async()=>Response.json({choices:[{message:{content:'{"summary":"A proposal remains subject to approval."}'},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.0001}}));
  const requests=Array.from({length:8},(_,i)=>unreadSummaryRequest({...input,briefings:[{...input.briefings[0],id:'edition-'+i}]}));
  const results:PromiseSettledResult<unknown>[]=[];
  for(let i=0;i<5;i++)results.push({status:'fulfilled',value:await unreadSummaryPort(env,i%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(requests[i])});
  results.push(...await Promise.allSettled(requests.slice(5).map((request,index)=>unreadSummaryPort(env,(index+5)%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(request))));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(6);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(2);expect(fetcher).toHaveBeenCalledTimes(6);
  const count=()=>local.db.prepare("SELECT COUNT(*) n FROM auth_attempts WHERE key='same-reader' AND action='unread-summary'").first<{n:number}>();
  expect((await count())?.n).toBe(6);
  const passed=results.findIndex(result=>result.status==='fulfilled');
  await unreadSummaryPort(env,passed%2?'quota-feed-a':'quota-feed-b','same-reader',fetcher).complete(requests[passed]);
  expect(fetcher).toHaveBeenCalledTimes(6);expect((await count())?.n).toBe(6);
  // Another account has its own quota; advancing the retained attempt timestamps reopens the hour.
  await unreadSummaryPort(env,'quota-feed-a','other-reader',fetcher).complete(requests[0]);
  await local.db.prepare("UPDATE auth_attempts SET created_at='2000-01-01T00:00:00Z' WHERE key='same-reader'").run();
  await unreadSummaryPort(env,'quota-feed-a','same-reader',fetcher).complete(unreadSummaryRequest({...input,language:'fr'}));
  expect(fetcher).toHaveBeenCalledTimes(8);
 }finally{await local.dispose()}
},30000);
