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

it('leaves the final provider slot for scheduled work across feeds, atomically',async()=>{
 const local=await createIntakeDatabase({product:true});try{
  const env={DB:local.db,OPENROUTER_API_KEY:'test-only'} as Env;
  for(const id of ['feed-0','feed-1','feed-2','other-feed','fourth-feed'])await local.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
  const fetcher=vi.fn(async()=>{throw new TypeError('response lost')});
  // Different readers and feeds cannot collectively consume the reserved slot.
  await Promise.allSettled(['reader-1','reader-2','reader-3'].map((reader,i)=>unreadSummaryPort(env,'feed-'+i,reader,fetcher).complete(unreadSummaryRequest(input))));
  expect(fetcher).toHaveBeenCalledTimes(2);
  const now=new Date().toISOString();
  await reserveModelSpending(local.db,{id:'scheduled',accountId:'test-only-account',feedId:'other-feed',token:'scheduled',model:'openai/gpt-4.1',reservedCostUsd:.01,leaseUntil:Date.now()+60000,createdAt:now,providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:20}});
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
