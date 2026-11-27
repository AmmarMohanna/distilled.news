import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {rateLimitedPublicHttp} from './connector-rate-limit';
import {createSourceBackend} from './source-backend';
import {receiptFixture} from '@distilled/contracts';
import type {SourceFetchRequest} from '@distilled/connectors';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true,archive:true})});
afterEach(async()=>ctx.dispose());
const response=(status=429,headers:Record<string,string>={})=>({status,headers,bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});
it('shares an origin cooldown across feeds, preserves real attempts and resumes after expiry',async()=>{
 let at=Date.parse('2026-10-16T12:00:00Z');const get=vi.fn(async()=>response()),authorize=vi.fn(async()=>{});
 const first=rateLimitedPublicHttp(ctx.db,{get},authorize,()=>at),second=rateLimitedPublicHttp(ctx.db,{get},authorize,()=>at);
 expect((await first.get('https://venturebeat.com/ai/feed/',{})).headers['retry-after']).toBe('300');
 const wait=await second.get('https://venturebeat.com/news/feed/',{});
 expect(wait).toMatchObject({status:429,telemetry:{requests:0,providerCostUsd:0}});expect(get).toHaveBeenCalledTimes(1);
 at+=300000;expect((await second.get('https://venturebeat.com/news/feed/',{})).headers['retry-after']).toBe('600');expect(get).toHaveBeenCalledTimes(2);
 at+=600000;get.mockImplementation(async()=>response(200));expect((await first.get('https://venturebeat.com/ai/feed/',{})).status).toBe(200);
 expect(await ctx.db.prepare('SELECT 1 FROM connector_http_cooldowns').first()).toBeNull();
 get.mockImplementation(async()=>response());expect((await first.get('https://venturebeat.com/ai/feed/',{})).headers['retry-after']).toBe('300');
});
it.each(['7200','Fri, 16 Oct 2026 14:00:00 GMT'])('honors the full Retry-After %s instead of imposing a shorter retry',async header=>{
 const at=Date.parse('2026-10-16T12:00:00Z'),get=vi.fn(async()=>response(429,{'retry-after':header}));
 const http=rateLimitedPublicHttp(ctx.db,{get},async()=>{},()=>at);
 expect((await http.get('https://example.com/feed',{})).headers['retry-after']).toBe('7200');
 expect((await http.get('https://other.example/feed',{})).telemetry.requests).toBe(1);
 expect((await http.get('https://example.com/feed',{})).telemetry.requests).toBe(0);expect(get).toHaveBeenCalledTimes(2);
});
it('rechecks source authorization even when it can answer without a network call',async()=>{
 let approved=true;const get=vi.fn(async()=>response());
 const http=rateLimitedPublicHttp(ctx.db,{get},async()=>{if(!approved)throw Error('SOURCE_NOT_APPROVED')},()=>0);
 await http.get('https://example.com/feed',{});approved=false;
 await expect(http.get('https://example.com/feed',{})).rejects.toThrow('SOURCE_NOT_APPROVED');expect(get).toHaveBeenCalledTimes(1);
});
it.each(['180','Fri, 16 Oct 2026 12:03:00 GMT'])('holds duplicate Google RSS jobs until Retry-After %s',async header=>{
 let now=Date.parse('2026-10-16T12:00:00Z');
 const dueAt=new Date(now).toISOString(),deadline=now+180_000;
 const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
 try{
  const fetcher=vi.fn<typeof fetch>(async()=>now<deadline?new Response(null,{status:429,headers:{'Retry-After':header}}):
   new Response('<rss version="2.0"><channel><title>Markets</title></channel></rss>'));
  const backend=createSourceBackend({DB:ctx.db,RAW_ARCHIVE:ctx.archive!,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',
   SOURCE_SHARED_PUBLIC_FETCH_ENABLED:'true'},{fetcher,authorize:async()=>true,
   intake:{acceptBatch:async batch=>({contractVersion:batch.contractVersion,handoffId:batch.handoffId,durable:true,receipts:batch.observations.map(receiptFixture)})}});
  const request=(id:string,region?:string,language?:string):SourceFetchRequest=>({
   scope:{feedId:id,feedSourceId:id,sourceId:id},runId:id,source:{family:'google_news',locator:'business markets',region,language},requestedBounds:{},limit:10
  });
  await backend.scheduler.schedule('first',request('first'),dueAt);
  await backend.scheduler.schedule('duplicate',request('duplicate','us','EN'),dueAt);
  expect(await backend.scheduler.runOne(300_000,'first')).toBe('RETRY');
  expect(await backend.scheduler.runOne(300_000,'duplicate')).toBe('RETRY');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await ctx.db.prepare('SELECT due_at,last_error,attempts FROM connector_provider_poll_jobs ORDER BY job_id').all()).results)
   .toEqual([0,1].map(attempts=>({due_at:new Date(deadline).toISOString(),last_error:'RATE_LIMIT',attempts})));
  now=deadline-1;
  expect(await backend.scheduler.runOne(300_000,'duplicate')).toBe('IDLE');
  expect(fetcher).toHaveBeenCalledTimes(1);
  now=deadline;
  expect(await backend.scheduler.runOne(300_000,'duplicate')).toBe('DONE');
  expect(fetcher).toHaveBeenCalledTimes(2);
 }finally{clock.mockRestore();}
});
it('backs off Google RSS without a header and keeps distinct searches independent',async()=>{
 let at=Date.parse('2026-10-16T12:00:00Z');
 const get=vi.fn(async()=>response()),random=vi.spyOn(Math,'random').mockReturnValue(0.5);
 try{
  const http=rateLimitedPublicHttp(ctx.db,{get},async()=>{},()=>at);
  const search='https://news.google.com/rss/search?q=business+markets&gl=US';
  expect((await http.get(search,{})).headers['retry-after']).toBe('263');
  expect((await http.get('https://news.google.com/rss/search?gl=US&q=business%20markets',{})).telemetry.requests).toBe(0);
  expect((await http.get('https://news.google.com/rss/search?q=oil&gl=US',{})).telemetry.requests).toBe(1);
  at+=263_000;
  expect((await http.get(search,{})).headers['retry-after']).toBe('525');
  expect(get).toHaveBeenCalledTimes(3);
 }finally{random.mockRestore();}
});
