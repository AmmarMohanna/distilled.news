import {createApp} from './app';
import {readEditionDelivery} from './v1-intelligence/delivery-status';
import {profileD1} from './perf/d1-profile';
import {connectorSourceHealth} from './connector-health';
import {publishedProductEditions} from './product-feeds';
import {HandoffError,sha256,hashContent,handoffFixture,receiptFixture} from '@distilled/contracts';
import {D1Repository} from './repository';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,testPolicy} from './v1-intake/test-utils';
import {enrollV1Source,isV1ProductSource} from './v1-intelligence/product';
import * as productEnrollment from './v1-intelligence/product';
import {authorizeConnectorSource,configureConnectorBudgets,createConnectorRuntime,runConnectorMaintenance,scheduleRecentTelegramRecheck,scheduleProviderWindow} from './connector-runtime';
import {productConnectorSource} from './connector-source';
import {processV1Acquisition,createV1RuntimePolicy} from './v1-downstream-runtime';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore} from './v1-intelligence/store';
import {processV1Briefing,processV1Reassessment} from './v1-intelligence/runtime';
import type {SourceFetchRequest} from '@distilled/connectors';
import {buildGoogleNewsRssUrl,TESTED_ACTORS,D1ProviderPollScheduler,D1ProviderSourceRepository,FallbackSourceCollector,ConnectorBatchArchive,R2SourcePayloadStore,sourceSqlFromD1} from '@distilled/connectors';
import type {Env} from './types';
import {freezeCollectionWindow,approvedCollectionBounds,initialCollectionStart} from './connector-collection-window';
import {expireCompletedConnectorBatches} from './connector-batch-expiry';
import {authorizeConnectorStorageCanary} from './connector-storage-recovery';
import {connectorBatchPayloads,sweepConnectorBatchUploads} from './connector-batch-uploads';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,request:SourceFetchRequest;
it('freezes X date windows, advances only finished scans, and refuses invented scope or run identities',async()=>{
 const {feed:enrolledFeed,scope}=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 const feed={...enrolledFeed,briefingSchedule:undefined,briefingFrequency:'DAILY' as const};
 const first=await freezeCollectionWindow(ctx.db,feed,scope.feedSourceId,feed.createdAt,scope.feedRevision,'bounded-first',new Date('2026-10-03T12:00:00Z'));
 expect(first).toEqual({startTime:'2026-10-03T00:00:00.000Z',endTime:'2026-10-03T12:00:00.000Z'});
 expect(await freezeCollectionWindow(ctx.db,feed,scope.feedSourceId,feed.createdAt,scope.feedRevision,'bounded-first',new Date('2026-10-03T13:00:00Z'))).toEqual(first);
 const r={...request,runId:'bounded-first',requestedBounds:first};expect(await approvedCollectionBounds(ctx.db,r)).toBe(true);
 expect(await approvedCollectionBounds(ctx.db,{...r,runId:'invented'})).toBe(false);
 expect(await approvedCollectionBounds(ctx.db,{...r,requestedBounds:{...first,endTime:'2026-10-04T00:00:00Z'}})).toBe(false);
 await expect(freezeCollectionWindow(ctx.db,{...feed,id:'other'},scope.feedSourceId,feed.createdAt,scope.feedRevision,'bounded-first',new Date())).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 const backend=createConnectorRuntime(env);await backend.scheduler.schedule('bounded-first',r,'2026-10-03T12:00:00Z',['x_twitterapi_io']);
 expect((await freezeCollectionWindow(ctx.db,feed,scope.feedSourceId,feed.createdAt,scope.feedRevision,'after-pending',new Date('2026-10-03T13:00:00Z'))).startTime).toBe(first.startTime);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='DONE',result=? WHERE job_id='bounded-first'").bind(JSON.stringify({request:{coverage:{status:'PARTIAL'}}})).run();
 expect((await freezeCollectionWindow(ctx.db,feed,scope.feedSourceId,feed.createdAt,scope.feedRevision,'after-partial',new Date('2026-10-03T13:00:00Z'))).startTime).toBe(first.startTime);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET result=? WHERE job_id='bounded-first'").bind(JSON.stringify({request:{coverage:{status:'COMPLETE'}}})).run();
 expect((await freezeCollectionWindow(ctx.db,feed,scope.feedSourceId,feed.createdAt,scope.feedRevision,'after-done',new Date('2026-10-03T13:00:00Z'))).startTime).toBe(first.endTime);
 expect(initialCollectionStart({...feed,briefingSchedule:{durationMinutes:60,timezone:'Asia/Beirut'}},'2026-10-03T12:42:00Z')).toBe('2026-10-03T12:00:00.000Z');
});
const objects=new Map<string,Uint8Array>();
function v3Fixture(summary:string){
 Object.assign(env,{BRIEFING_ENGINE:'v3',BRIEFING_EDITOR_MODEL:'openai/gpt-4.1',BRIEFING_VERIFIER_MODEL:'openai/gpt-4.1-mini',OPENROUTER_API_KEY:'test-only-key'});
 return vi.fn(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body)),verify=body.messages[0].content.includes('meticulous fact-checker');
  const content=verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:summary,body:summary,sources:['S1'],relation:'new',updates:null,importance:1}]};
  const required=body.response_format?.json_schema?.schema?.properties?.source_decisions?.required;
  if(!verify&&required){expect(required).toEqual(['S1']);Object.assign(content,{source_decisions:{S1:{decision:'selected',why:'The collected source supports this fixture development.'}}});}
  return Response.json({id:crypto.randomUUID(),choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
}
it('queue-mode X maintenance schedules one authorized frozen window and resumes its saved identity',async()=>{
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,actor_id,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('x-source','feed-1','NASA','channel','apify','x_profile','https://x.com/NASA','https://x.com/NASA',?,1,'connector',?,?,?)").bind(TESTED_ACTORS.x,testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("UPDATE briefings SET briefing_cadence='hourly',v1_briefing_interval_minutes=60,briefing_timezone='UTC',briefing_time_of_day='00:00' WHERE id='feed-1'").run();
 const queued={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:'x-source',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',PRODUCT_FEEDS_ENABLED:'true',SOURCE_PROVIDER_BUDGETS_JSON:JSON.stringify({x_twitterapi_io:15}),SOURCE_OPERATION_CEILINGS_JSON:JSON.stringify({twitterApiIo:.1})};
 await runConnectorMaintenance(queued,new Date('2026-10-03T12:00:01Z'),{scheduleOnly:true});
 const first=await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs').first<{request:string}>();expect(first).not.toBeNull();
 const saved=JSON.parse(first!.request) as SourceFetchRequest;
 expect(saved.requestedBounds).toEqual({startTime:'2026-10-03T12:00:00.000Z',endTime:'2026-10-03T12:00:01.000Z'});
 expect(await authorizeConnectorSource(queued,saved)).toBe(true);
 await runConnectorMaintenance(queued,new Date('2026-10-03T12:00:30Z'),{scheduleOnly:true});
 expect(await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs').first()).toEqual(first);
 expect(await authorizeConnectorSource(queued,{...saved,runId:'unscheduled-copy'})).toBe(false);
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET request=?").bind(JSON.stringify({...saved,runId:'frozen-next-page'})).run();
 expect(await authorizeConnectorSource(queued,{...saved,runId:'frozen-next-page'})).toBe(true);
 await ctx.db.prepare("UPDATE sources SET enabled=0 WHERE id='x-source'").run();
 expect(await authorizeConnectorSource(queued,{...saved,runId:'frozen-next-page'})).toBe(false);
});
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});objects.clear();
 await ctx.db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','owner@example.invalid','owner@example.invalid','owner','user','hash',?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','news','News','banking reform',1,?,?)").bind(testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('feed-source-1','feed-1','RSS','channel','rss','rss_feed','https://example.com/feed',1,'connector',?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 const enrolled=await enrollV1Source(ctx.db,'feed-source-1','owner-1',testPolicy.now());
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_EDITORIAL_PLAN_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',SOURCE_CONNECTORS_ENABLED:'true',RAW_ARCHIVE:{put:async(key:string,bytes:Uint8Array)=>{if(!objects.has(key))objects.set(key,bytes)},get:async(key:string)=>{const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer}:null}}} as unknown as Env;
 request={scope:{feedId:'feed-1',feedSourceId:'feed-source-1',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'rss-run',source:{family:'rss',locator:'https://example.com/feed'},requestedBounds:{},limit:30};
});
afterEach(async()=>ctx?.dispose());
it('defers new collection at the storage threshold and resumes with the normal identity',async()=>{
 const due=new Date('2026-10-03T13:00:00Z');
 const pressured=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>sql==='SELECT 1'?{run:async()=>({meta:{size_after:9_000_000_000}})}:target.prepare(sql);
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const guarded={...env,STORAGE_MAINTENANCE_ENABLED:'true'};
 expect(await runConnectorMaintenance({...guarded,DB:pressured},due,{scheduleOnly:true})).toMatchObject({scheduled:[]});
 expect(await ctx.db.prepare('SELECT COUNT(*) AS count FROM connector_rss_poll_jobs').first()).toEqual({count:0});
 const resumed=await runConnectorMaintenance(guarded,due,{scheduleOnly:true});
 expect(resumed?.scheduled).toHaveLength(1);
 expect((await runConnectorMaintenance(guarded,due,{scheduleOnly:true}))?.scheduled).toEqual(resumed?.scheduled);
},20_000);
it('admits only one named poll after a verified storage recovery and preserves other due work',async()=>{
 const now=Date.now(),allocated=9_020_000_000;
 const measured=new Proxy(ctx.db,{get(target,key){
  if(key==='prepare')return (sql:string)=>sql==='SELECT 1'?{run:async()=>({meta:{size_after:allocated}})}:target.prepare(sql);
  if(key==='batch')return async(statements:D1PreparedStatement[])=>(await target.batch(statements)).map(result=>
   ({...result,meta:{...result.meta,size_after:allocated}}));
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
 const guarded={...env,DB:measured,STORAGE_MAINTENANCE_ENABLED:'true'};
 const options={scheduleOnly:true,feedId:'feed-1'};
 expect((await runConnectorMaintenance(guarded,new Date(now),options))?.scheduled).toHaveLength(0);
 expect(await authorizeConnectorStorageCanary(measured,'other-feed','feed-source-1',now)).toBe(false);
 expect(await authorizeConnectorStorageCanary(measured,'feed-1','feed-source-1',now)).toBe(true);
 expect(await authorizeConnectorStorageCanary(measured,'feed-1','feed-source-1',now)).toBe(false);
 const outcomes=await Promise.all([0,1].map(()=>runConnectorMaintenance(guarded,new Date(now),options)));
 expect(outcomes.map(result=>result?.scheduled.length).sort()).toEqual([0,1]);
 expect(await ctx.db.prepare('SELECT COUNT(*) AS count FROM connector_storage_probe').first()).toEqual({count:0});
 expect((await runConnectorMaintenance(guarded,new Date(now+60_000),options))?.storageDeferred).toBe(true);
},20_000);
it('expires a completed batch, preserves health metadata, and leaves pending poll payloads intact',async()=>{
 const now=new Date(),xml='<rss><channel>'+Array.from({length:4},(_,i)=>`<item><guid>story-${i}</guid><title>Story ${i}</title><link>https://example.com/articles/${i}</link><description>One new development per story.</description></item>`).join('')+'</channel></rss>';
 const runtime=createConnectorRuntime(env,vi.fn(async()=>new Response(xml)) as typeof fetch);
 const rss={scope:request.scope,configurationRevision:request.configurationRevision,runId:'expiry-fixture',url:request.source.locator,maxItems:30};
 await runtime.rssScheduler.schedule(rss.runId,rss,now.toISOString());
 expect(await runtime.rssScheduler.runOne(120000,rss.runId)).toBe('DONE');
 const original=await ctx.db.prepare("SELECT handoff_id,json_extract(data,'$.archiveRef') ref FROM connector_batches").first<{handoff_id:string;ref:string}>();
 expect(original?.ref).toMatch(/^connector-batches\/v2\//);
 const [due]= (await ctx.db.prepare('SELECT batch_id,expires_at FROM connector_batch_expiry').all<{batch_id:string;expires_at:number}>()).results;
 expect(due.batch_id).toBe(original?.handoff_id);
 const expireAt=new Date((due.expires_at+1)*1000);
 const remove=vi.fn(async(key:string)=>{objects.delete(key);});
 const bucket={delete:remove} as unknown as R2Bucket;
 expect(await expireCompletedConnectorBatches({DB:ctx.db,RAW_ARCHIVE:bucket},now)).toBe(0);
 await ctx.db.prepare("INSERT INTO connector_batches(feed_id,feed_source_id,handoff_id,data) VALUES('feed-1','feed-source-1','pending','{}')").run();
 remove.mockRejectedValueOnce(Error('simulated archive outage'));
 expect(await expireCompletedConnectorBatches({DB:ctx.db,RAW_ARCHIVE:bucket},expireAt)).toBe(0);
 expect(objects.has(original!.ref)).toBe(true);
 expect(await expireCompletedConnectorBatches({DB:ctx.db,RAW_ARCHIVE:bucket},new Date(expireAt.getTime()+120_000))).toBe(1);
 expect(objects.has(original!.ref)).toBe(false);
 expect(await connectorSourceHealth(ctx.db,'feed-1','feed-source-1')).toMatchObject({lastBatch:{observations:4,accepted:true},cumulative:{observations:4}});
 expect(await ctx.db.prepare("SELECT data FROM connector_batches WHERE handoff_id='pending'").first()).toEqual({data:'{}'});
 await expect(runtime.collectRss(rss)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
},25_000);
it('recovers and expires a completed provider batch while isolating malformed references',async()=>{
 let now=Date.now();
 const storage={DB:ctx.db,RAW_ARCHIVE:{...env.RAW_ARCHIVE,delete:vi.fn(async(key:string)=>{objects.delete(key);})} as unknown as R2Bucket};
 const batchArchive=new ConnectorBatchArchive(connectorBatchPayloads(storage));
 const sql=sourceSqlFromD1(ctx.db),repository=new D1ProviderSourceRepository(sql,batchArchive);
 const input:SourceFetchRequest={...request,source:{family:'website',locator:'https://example.com'},runId:'provider-expiry'};
 const fetch=vi.fn(async()=>({items:Array.from({length:4},(_,index)=>({sourceItemKey:`story-${index}`,body:`Reported development ${index}`,url:`https://example.com/${index}`,representation:'ARTICLE_EXCERPT' as const,contentCompleteness:'UNKNOWN' as const,identityValid:true})),raw:new Uint8Array([1]),complete:true,requests:1,latencyMs:1,providerCostUsd:0}));
 const acceptBatch=vi.fn(async(batch:ReturnType<typeof handoffFixture>)=>({contractVersion:batch.contractVersion,handoffId:batch.handoffId,durable:true as const,receipts:batch.observations.map(receiptFixture)}));
 const makeScheduler=()=>new D1ProviderPollScheduler(sql,new FallbackSourceCollector(new D1ProviderSourceRepository(sql,batchArchive),new R2SourcePayloadStore(storage.RAW_ARCHIVE),
  {acceptBatch},[{id:'website_http',families:['website'],fetch}]),async()=>true,()=>now);
 const scheduler=makeScheduler();
 await scheduler.schedule(input.runId,input,new Date(now).toISOString(),['website_http']);
 acceptBatch.mockRejectedValueOnce(Error('interrupted intake'));
 expect(await scheduler.runOne(300000,input.runId)).toBe('RETRY');
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_batch_expiry').first()).toEqual({n:0});
 const row=(await ctx.db.prepare("SELECT batch_key,json_extract(data,'$.archiveRef') ref FROM connector_provider_batches").first<{batch_key:string;ref:string}>())!;
 expect(row.ref).toMatch(/^connector-batches\/v2\//);
 const original=(await repository.loadProviderBatch(input.scope,row.batch_key))!;
 now+=30_000;
 expect(await makeScheduler().runOne(300000,input.runId)).toBe('DONE');
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(await repository.loadProviderReceipts(input.scope,row.batch_key)).toMatchObject({durable:true});
 const health=await connectorSourceHealth(ctx.db,input.scope.feedId,input.scope.feedSourceId);
 expect(health).toMatchObject({provider:'website_http',lastBatch:{observations:4,accepted:true}});
 const journal=(await ctx.db.prepare('SELECT expires_at FROM connector_batch_expiry WHERE batch_id=?').bind(row.batch_key).first<{expires_at:number}>())!;
 const malformed='not-a-connector-key';
 await ctx.db.prepare('INSERT INTO connector_provider_batches VALUES(?,?,?,?,?)')
  .bind(input.scope.feedId,input.scope.feedSourceId,'malformed',JSON.stringify({archiveRef:malformed}),'{}').run();
 await ctx.db.prepare("INSERT INTO connector_batch_expiry(kind,feed_id,feed_source_id,batch_id,expires_at) VALUES('provider',?,?,?,?)")
  .bind(input.scope.feedId,input.scope.feedSourceId,'malformed',journal.expires_at-1).run();
 expect(await expireCompletedConnectorBatches(storage,new Date(journal.expires_at*1000))).toBe(1);
 expect(storage.RAW_ARCHIVE.delete).toHaveBeenCalledExactlyOnceWith(row.ref);
 expect(await ctx.db.prepare("SELECT quarantine_reason FROM connector_batch_expiry WHERE batch_id='malformed'").first()).toEqual({quarantine_reason:'INVALID_ARCHIVE_REFERENCE'});
 expect(await ctx.db.prepare("SELECT data FROM connector_provider_batches WHERE batch_key='malformed'").first()).toEqual({data:JSON.stringify({archiveRef:malformed})});
 expect(await connectorSourceHealth(ctx.db,input.scope.feedId,input.scope.feedSourceId)).toMatchObject({lastBatch:health.lastBatch,cumulative:health.cumulative});
 await expect(repository.loadProviderBatch(input.scope,row.batch_key)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await expect(repository.saveProviderBatch(row.batch_key,original)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 expect(await repository.loadProviderReceipts(input.scope,row.batch_key)).toBeUndefined();
 const orphan=(await ctx.db.prepare("SELECT object_key FROM connector_batch_uploads WHERE state='VERIFIED'").first<{object_key:string}>())!;
 expect(objects.has(orphan.object_key)).toBe(true);
 await ctx.db.prepare('UPDATE connector_batch_uploads SET cleanup_at=0').run();
 expect(await sweepConnectorBatchUploads(storage)).toBe(1);
 expect(objects.has(orphan.object_key)).toBe(false);
 expect(fetch).toHaveBeenCalledTimes(1);
},30_000);

it('collects abandoned uploads after a failed D1 attach, and fences late attachment during cleanup',async()=>{
 const remove=vi.fn(async(key:string)=>{objects.delete(key);});
 const storage={DB:ctx.db,RAW_ARCHIVE:{...env.RAW_ARCHIVE,delete:remove} as unknown as R2Bucket};
 const payloads=connectorBatchPayloads(storage);
 const scope={...request.scope,sourceId:request.scope.feedSourceId};
 const bytes=new TextEncoder().encode('private batch');
 const attached=await payloads.put(scope,bytes,'application/json');
 const save=(key:string,batchId:string)=>ctx.db.prepare('INSERT INTO connector_provider_batches(feed_id,feed_source_id,batch_key,data) VALUES(?,?,?,?)')
  .bind(scope.feedId,scope.feedSourceId,batchId,JSON.stringify({archiveRef:key})).run();
 await save(attached.ref,'attached');
 const abandoned=await payloads.put(scope,bytes,'application/json');
 await expect(save(abandoned.ref,'attached')).rejects.toThrow();
 const racing=await payloads.put(scope,bytes,'application/json');
 await ctx.db.prepare('UPDATE connector_batch_uploads SET cleanup_at=0').run();
 remove.mockImplementation(async key=>{
  if(key===racing.ref)await expect(save(key,'late-attach')).rejects.toThrow('CONNECTOR_UPLOAD_NOT_VERIFIED');
  objects.delete(key);
 });
 expect(await sweepConnectorBatchUploads(storage)).toBe(2);
 expect(objects.has(attached.ref)).toBe(true);
 expect(await payloads.get(scope,attached.ref)).toEqual(bytes);
 expect(objects.has(abandoned.ref)).toBe(false);
 expect(objects.has(racing.ref)).toBe(false);
 expect(await ctx.db.prepare('SELECT COUNT(*) AS count FROM connector_batch_uploads').first()).toEqual({count:0});
},25_000);

it('collects RSS from publishers requiring the same bot identity used during assessment',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const headers=new Headers(init?.headers);
  if(headers.get('user-agent')!=='DistilledNewsBot/0.1 (+https://distilled.news)')return new Response('Bot identity required',{status:403});
  expect(headers.get('accept')).toContain('application/rss+xml');
  return new Response('<rss><channel><item><guid>identified-report</guid><title>Lebanon banking reform approved</title><description>Parliament approved banking legislation.</description><link>https://example.com/identified</link></item></channel></rss>');
 });
 const backend=createConnectorRuntime(env,fetcher);
 const result=await backend.collectRss({scope:request.scope,configurationRevision:request.configurationRevision,runId:'identified-rss',url:request.source.locator,maxItems:30});
 expect(result.checkpoint).toBe('ADVANCED');
 expect(result.coverage.failureReason).toBe('NONE');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('CAS retries reuse only verified immutable payload metadata within their own policy instance',async()=>{
 const body='Known immutable body',fixture=handoffFixture().observations[0],canonicalUrl='https://example.com/article';
 const o={...fixture,...request.scope,id:'verification-observation',representation:'ARTICLE_EXCERPT' as const,contentCompleteness:'UNKNOWN' as const,canonicalUrl,titleHint:'Known title',contentHash:await hashContent({representation:'ARTICLE_EXCERPT',title:'Known title',body})};
 const payload=await createConnectorRuntime(env).payloads.put(request.scope,new TextEncoder().encode(JSON.stringify({body,title:'Known title',canonicalUrl,representation:o.representation,contentCompleteness:o.contentCompleteness})),'application/json');
 const get=vi.spyOn(env.RAW_ARCHIVE,'get');const supplied={...o,suppliedPayloadRef:payload.ref};
 try{
  const policy=createV1RuntimePolicy(fetch,env.RAW_ARCHIVE);
  expect(await policy.verifySuppliedContent(supplied)).toMatchObject({contentHash:o.contentHash});
  await policy.verifySuppliedContent(supplied);expect(get).toHaveBeenCalledTimes(1);
  await createV1RuntimePolicy(fetch,env.RAW_ARCHIVE).verifySuppliedContent(supplied);expect(get).toHaveBeenCalledTimes(2);
  await expect(policy.verifySuppliedContent({...supplied,contentHash:'0'.repeat(64)})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(get).toHaveBeenCalledTimes(3);
  await expect(policy.verifySuppliedContent({...supplied,canonicalUrl:'https://different.example/article'})).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect(get).toHaveBeenCalledTimes(4);
 }finally{get.mockRestore()}
});
it('enrolls a single source once and freezes the updated product revision',async()=>{
 await ctx.db.prepare("UPDATE briefings SET interest_profile='updated single-source interests' WHERE id='feed-1'").run();
 const enrollment=vi.spyOn(productEnrollment,'enrollV1Source');
 try{
  await runConnectorMaintenance(env,new Date(testPolicy.now()),{scheduleOnly:true});
  expect(enrollment).toHaveBeenCalledTimes(1);
  const job=await ctx.db.prepare('SELECT request FROM connector_rss_poll_jobs').first<{request:string}>();
  const feed=await new V1FeedStore(ctx.db).getFeed('feed-1');
  expect(feed?.interests).toEqual(['updated single-source interests']);
  expect(JSON.parse(job!.request).configurationRevision).toBe(feed?.revision);
 }finally{enrollment.mockRestore()}
});
it('synchronizes all source configurations before freezing same-feed polling revisions',async()=>{
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('feed-source-2','feed-1','Second RSS','channel','rss','rss_feed','https://example.com/second.xml',1,'connector',?,?,?)").bind(testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 await ctx.db.prepare("UPDATE briefings SET interest_profile='changed interests' WHERE id='feed-1'").run();
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='feed-source-1,feed-source-2';
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('<rss><channel><item><guid>one</guid><title>News</title><link>https://example.com/news</link></item></channel></rss>'));
 try{
  await runConnectorMaintenance(env);
  const jobs=await ctx.db.prepare('SELECT request,state,last_error FROM connector_rss_poll_jobs').all<{request:string;state:string;last_error:string|null}>();
  expect(jobs.results).toHaveLength(2);
  expect(jobs.results.map(row=>({state:row.state,error:row.last_error}))).toEqual([{state:'DONE',error:null},{state:'DONE',error:null}]);
  expect(new Set(jobs.results.map(row=>JSON.parse(row.request).configurationRevision)).size).toBe(1);
 }finally{fetchMock.mockRestore()}
});
it('continues maintenance with more than ten configured sources while fencing unapproved jobs',async()=>{
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS=Array.from({length:12},(_,i)=>`missing-${i}`).join(',');
 await createConnectorRuntime(env).scheduler.schedule('denied-large-list',{...request,runId:'denied-large-list',scope:{...request.scope,feedSourceId:'unapproved'},source:{family:'website',locator:'https://example.com/article'}},new Date(0).toISOString(),['website_http']);
 const result=await runConnectorMaintenance(env);
 expect(result?.outcomes).toContainEqual(expect.objectContaining({scheduler:'provider',state:'CANCELLED'}));
});
it('drains a bounded slice of pending provider jobs without starting unauthorized calls',async()=>{
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='';env.SOURCE_POLL_MAX_JOBS_PER_TICK='4';
 const scheduler=createConnectorRuntime(env).scheduler;
 for(let i=0;i<6;i++)await scheduler.schedule(`denied-${i}`,{...request,runId:`denied-${i}`,scope:{...request.scope,feedSourceId:'unapproved'},source:{family:'website',locator:'https://example.com/article'}},new Date(0).toISOString(),['website_http']);
 const result=await runConnectorMaintenance(env);
 expect(result?.outcomes.filter(v=>v.scheduler==='provider').map(v=>v.state)).toEqual(['CANCELLED','CANCELLED','CANCELLED','CANCELLED']);
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM connector_provider_poll_jobs WHERE state='PENDING'").first()).toEqual({n:2});
 await runConnectorMaintenance(env);
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM connector_provider_poll_jobs WHERE state='PENDING'").first()).toEqual({n:0});
});
it('historical manual records cannot prioritize new collection over scheduled work',async()=>{
 env.SOURCE_POLL_MAX_JOBS_PER_TICK='1';
 const backend=createConnectorRuntime(env),due=new Date(0).toISOString();
 await backend.rssScheduler.schedule('old',{scope:request.scope,runId:'old',configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:{},maxItems:30},due);
 await backend.rssScheduler.schedule('manual',{scope:request.scope,runId:'manual',configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:{},maxItems:30},new Date(1000).toISOString());
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('manual_briefing_requests','manual-request','feed-1',?)").bind(JSON.stringify({id:'manual-request',state:'PENDING',phase:'COLLECTION',createdAt:due,scheduled:[{id:'manual',scheduler:'rss',sourceId:'feed-source-1'}]})).run();
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('<rss><channel><item><guid>one</guid><title>News</title><link>https://example.com/news</link></item></channel></rss>'));
 try {
  await runConnectorMaintenance(env,new Date(),{skipSchedule:true});
  expect(await ctx.db.prepare('SELECT job_id,state FROM connector_rss_poll_jobs ORDER BY job_id').all()).toMatchObject({results:[{job_id:'manual',state:'PENDING'},{job_id:'old',state:'DONE'}]});
 }finally{fetchMock.mockRestore()}
});
it('rejects invalid maintenance bounds before changing budgets or scheduling work',async()=>{
 env.SOURCE_POLL_MAX_JOBS_PER_TICK='21';
 await expect(runConnectorMaintenance(env)).rejects.toThrow('INVALID_POLL_RUNNER_BOUNDS');
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_poll_jobs').first()).toEqual({n:0});
});
it('spaces new LinkedIn windows after a confirmed monthly provider cap',async()=>{
 const locator='https://www.linkedin.com/company/nvidia/';
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,actor_id,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('linkedin-source','feed-1','NVIDIA','channel','apify','linkedin_company',?,?,?,1,'connector',?,?,?)").bind(locator,'linkedin: '+locator,TESTED_ACTORS.linkedin_company,testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 const queued={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:'linkedin-source',APIFY_API_TOKEN:'fixture',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_PROVIDER_BUDGETS_JSON:'{"linkedin_apify":15}',SOURCE_OPERATION_CEILINGS_JSON:'{"apify":0.25}'};
 const schedule=(time:string)=>runConnectorMaintenance(queued,new Date(time),{scheduleOnly:true});
 await schedule('2026-10-03T12:00:00Z');
 const poll=await ctx.db.prepare('SELECT provider_order FROM connector_provider_poll_jobs').first<{provider_order:string}>();
 expect(JSON.parse(poll!.provider_order)).toEqual(['linkedin_innolabs_apify','linkedin_apify']);
 const result=JSON.stringify({state:'FETCH_FAILED',attempts:[{failure:'BUDGET_EXCEEDED',diagnostic:{detail:'PROVIDER_MONTHLY_USAGE_LIMIT'}}]});
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='BLOCKED',last_error='BUDGET_EXCEEDED',result=?").bind(result).run();
 expect((await schedule('2026-10-03T12:05:00Z'))?.scheduled).toHaveLength(0);
 expect((await schedule('2026-10-03T13:00:00Z'))?.scheduled).toHaveLength(1);
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_poll_jobs WHERE state='BLOCKED'").first()).toEqual({n:1});
});
it('schedules a fresh website poll without Zyte while a scoped paid outcome is unresolved',async()=>{
 const locator='https://nowlebanon.com/';
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('website-source','feed-1','Now Lebanon','channel','web','web_page',?,?,1,'connector',?,?,?)").bind(locator,locator,testPolicy.now(),testPolicy.now(),testPolicy.now()).run();
 const queued={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:'website-source',ZYTE_API_KEY:'fixture',SOURCE_NATIVE_EXECUTION_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_PROVIDER_BUDGETS_JSON:'{"zyte":15}',SOURCE_OPERATION_CEILINGS_JSON:'{"zyte":0.05}'};
 const backend=createConnectorRuntime(queued);
 const {scope}=await enrollV1Source(ctx.db,'website-source','owner-1',testPolicy.now());
 const old={...request,scope:{feedId:scope.feedId,feedSourceId:scope.feedSourceId,sourceId:scope.sourceId},configurationRevision:scope.feedRevision,runId:'held-website',source:{family:'website',locator} as const};
 await backend.scheduler.schedule(old.runId,old,'2026-10-03T11:55:00Z');
 await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET state='BLOCKED',last_error='UNCERTAIN_PAID_SUBMISSION' WHERE job_id=?").bind(old.runId).run();
 await ctx.db.prepare("INSERT INTO connector_provider_operations(provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id,headers) VALUES('zyte','held-payment','hash',0.05,-1,'feed-1','website-source','{}')").run();
 await runConnectorMaintenance(queued,new Date('2026-10-03T12:00:00Z'),{scheduleOnly:true});
 const polls=await ctx.db.prepare("SELECT state,last_error,provider_order FROM connector_provider_poll_jobs ORDER BY scheduled_at").all();
 expect(polls.results).toEqual([
  {state:'BLOCKED',last_error:'UNCERTAIN_PAID_SUBMISSION',provider_order:JSON.stringify(['website_http','website_playwright','website_zyte'])},
  {state:'PENDING',last_error:null,provider_order:JSON.stringify(['website_http','website_playwright'])},
 ]);
 expect(await ctx.db.prepare("SELECT status,ceiling_usd FROM connector_provider_operations WHERE operation_id='held-payment'").first()).toEqual({status:-1,ceiling_usd:0.05});
});
it('reuses the winning durable provider order when funding changes race with initial scheduling',async()=>{
 const r:SourceFetchRequest={...request,source:{family:'website',locator:'https://example.com/article'},limit:1};
 let reads=0;
 const provider_order=JSON.stringify(['website_http','website_playwright']),initial_hash=await sha256(JSON.stringify([JSON.stringify(r),provider_order]));
 const db={prepare:()=>({bind:()=>({first:async()=>reads++===0?null:{initial_hash,provider_order}})})} as unknown as D1Database;
 const schedule=vi.fn().mockRejectedValueOnce(new HandoffError('IDEMPOTENCY_CONFLICT')).mockResolvedValueOnce(undefined);
 await scheduleProviderWindow(db,{schedule},r,new Date('2026-10-10T08:00:00Z'),['website_http','website_playwright','website_zyte']);
 expect(schedule.mock.calls.map(call=>call[3])).toEqual([['website_http','website_playwright','website_zyte'],['website_http','website_playwright']]);
});
it('keeps a durable provider window immutable across funding changes and rejects a changed source identity',async()=>{
 const r:SourceFetchRequest={...request,source:{family:'website',locator:'https://example.com/article'},limit:1};
 const scheduler=new D1ProviderPollScheduler(sourceSqlFromD1(ctx.db),{collect:async()=>{throw new Error('must not fetch')}},async()=>true);
 await scheduleProviderWindow(ctx.db,scheduler,r,new Date('2026-10-10T08:00:00Z'),['website_http','website_playwright']);
 const resumed={...r,runId:r.runId+':retry:1',continuation:{providerId:'website_playwright',token:'saved-page'}};
 await ctx.db.prepare('UPDATE connector_provider_poll_jobs SET request=? WHERE job_id=?').bind(JSON.stringify(resumed),r.runId).run();
 await scheduleProviderWindow(ctx.db,scheduler,r,new Date('2026-10-10T08:05:00Z'),['website_http','website_playwright','website_zyte']);
 const jobs=await ctx.db.prepare('SELECT provider_order FROM connector_provider_poll_jobs').all<{provider_order:string}>();
 expect(jobs.results).toEqual([{provider_order:JSON.stringify(['website_http','website_playwright'])}]);
 expect(JSON.parse((await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs WHERE job_id=?').bind(r.runId).first<{request:string}>())!.request)).toEqual(resumed);
 await expect(scheduleProviderWindow(ctx.db,scheduler,{...r,source:{family:'website',locator:'https://different.example/article'}},new Date(),['website_http'])).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
});
it('rejects malformed RSS configuration and preserves website ownership when its private runtime is missing',async()=>{
 expect(productConnectorSource({provider:'rss',kind:'rss_feed',source_url:'not a URL',input:null})).toBeUndefined();
 expect(productConnectorSource({provider:'rss',kind:'rss_feed',source_url:'https://127.0.0.1/feed',input:null})).toBeUndefined();
 await ctx.db.prepare("UPDATE sources SET provider='web',kind='web_page',source_url='https://example.com/article',input='https://example.com/article',collection_owner='legacy' WHERE id='feed-source-1'").run();
 await runConnectorMaintenance(env);
 expect(await ctx.db.prepare("SELECT collection_owner FROM sources WHERE id='feed-source-1'").first()).toEqual({collection_owner:'legacy'});
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_provider_poll_jobs').first()).toEqual({n:0});
});
it('freezes one daily Telegram edit range when new accepted messages arrive and refreshes it the next day',async()=>{
 const r:SourceFetchRequest={...request,source:{family:'telegram',locator:'telegram',channelId:'-100123',public:true},limit:3};
 const scheduler=new D1ProviderPollScheduler(sourceSqlFromD1(ctx.db),{collect:async()=>{throw new Error('must not fetch')}},async()=>true);
 const record=async(id:number)=>ctx.db.prepare('INSERT INTO connector_item_fingerprints VALUES(?,?,?,?,?,?,?)').bind(r.scope.feedId,r.scope.feedSourceId,r.scope.sourceId,`telegram:-100123:${id}`,r.configurationRevision,`fingerprint-${id}`,id).run();
 await record(1);
 expect(await scheduleRecentTelegramRecheck(ctx.db,scheduler,r,new Date('2026-10-10T08:00:00Z'))).toBe(true);
 await record(2);
 const scheduled=(await ctx.db.prepare('SELECT job_id,request FROM connector_provider_poll_jobs').first<{job_id:string;request:string}>())!;
 await ctx.db.prepare('UPDATE connector_provider_poll_jobs SET request=? WHERE job_id=?').bind(JSON.stringify({...JSON.parse(scheduled.request),runId:scheduled.job_id+':retry:1'}),scheduled.job_id).run();
 expect(await scheduleRecentTelegramRecheck(ctx.db,scheduler,{...r,runId:'later-poll'},new Date('2026-10-10T08:05:00Z'))).toBe(false);
 const jobs=await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs ORDER BY due_at').all<{request:string}>();
 expect(jobs.results).toHaveLength(1);expect(JSON.parse(jobs.results[0].request).recheckItemKeys).toEqual(['telegram:-100123:1']);
 expect(await scheduleRecentTelegramRecheck(ctx.db,scheduler,r,new Date('2026-10-11T08:00:00Z'))).toBe(true);
 const latest=await ctx.db.prepare('SELECT request FROM connector_provider_poll_jobs ORDER BY due_at DESC LIMIT 1').first<{request:string}>();
 expect(JSON.parse(latest!.request).recheckItemKeys).toEqual(['telegram:-100123:2','telegram:-100123:1']);
});
it('migrates empty D1 and connects RSS through receipts, acquisition, V3 and grounded immutable publication',async()=>{
 const publishedAt=new Date(Date.now()-3600000).toUTCString();
 const fetcher=vi.fn(async()=>new Response(`<rss version="2.0"><channel><title>News</title><item><guid>banking-1</guid><link>https://example.com/news/1</link><title>Lebanon Parliament approved banking reform legislation</title><description>Lebanon Parliament approved banking reform legislation</description><pubDate>${publishedAt}</pubDate></item></channel></rss>`,{headers:{'content-type':'application/rss+xml'}}));
 const runtime=createConnectorRuntime(env,fetcher as typeof fetch);
 const rss={scope:request.scope,configurationRevision:request.configurationRevision,runId:request.runId,url:request.source.locator,maxItems:30};
 const first=await runtime.collectRss(rss);expect(first.checkpoint).toBe('ADVANCED');
 const replay=await runtime.collectRss(rss);expect(replay.checkpoint).toBe('UNCHANGED');expect(fetcher).toHaveBeenCalledTimes(1);expect(objects.size).toBeGreaterThan(1);
 expect(await connectorSourceHealth(ctx.db,'feed-1','feed-source-1')).toMatchObject({alerts:[],lastBatch:{accepted:true}});
 const intake=new V1IntakeStore(ctx.db);expect(await intake.list('intake_receipts','feed-source-1')).toMatchObject([{checkpointResolution:'RESOLVED'}]);expect(await intake.list('candidates','feed-source-1')).toHaveLength(1);
 const job=(await intake.listPendingJobs('feed-source-1')).find(j=>j.kind==='ACQUIRE')!;
 await processV1Acquisition(env,job.id);expect(await intake.list('revisions','feed-source-1')).toHaveLength(1);
 await processV1Acquisition(env,job.id);expect(await intake.list('revisions','feed-source-1')).toHaveLength(1);
 const feeds=new V1FeedStore(ctx.db),now=new Date(Date.now()+60000).toISOString();
 const reassess=(await intake.listPendingJobs('feed-source-1')).find(j=>j.kind==='REASSESS')!;
 const model=v3Fixture('Lebanon Parliament approved banking reform legislation');
 await processV1Reassessment(env,reassess.id,new Date().toISOString());
 expect(await feeds.list('feed-1','events')).toHaveLength(0);expect(await feeds.list('feed-1','storylines')).toHaveLength(0);
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:{start:new Date(Date.parse(now)-86400000).toISOString(),end:now,kind:'DAILY' as const}};
 const edition=(await processV1Briefing(env,message,()=>now,undefined,model))!;
 expect(edition.engine).toBe('v3');expect(model).toHaveBeenCalledTimes(2);
 const projection=await publishedProductEditions(env,(await new D1Repository(ctx.db).getBriefingById("feed-1"))!);
 expect(projection).toHaveLength(1);expect(projection[0].sections[0].summary).toBe(edition.stories[0].claims.map(c=>c.text).join(" "));expect(projection[0].sections[0].evidence[0].sourceUrl).toBe("https://example.com/news/1");
 expect(edition.stories).toHaveLength(1);expect(edition.evidenceRevisionIds).toHaveLength(1);
 expect(edition.stories[0].claims[0].support[0].evidenceRevisionId).toBe(edition.evidenceRevisionIds[0]);
 expect(await processV1Briefing(env,message,()=>now,undefined,model)).toEqual(edition);expect(await feeds.list('feed-1','editions')).toHaveLength(1);expect(model).toHaveBeenCalledTimes(2);
 await ctx.db.prepare("INSERT INTO username_aliases(username,account_id,is_current,created_at) VALUES('owner','owner-1',1,?)").bind(testPolicy.now()).run();
 const response=await createApp().request('/api/feed/owner/news',{}, {...env,PRODUCT_FEEDS_ENABLED:'true'});
 expect(response.status).toBe(200);const publicFeed=await response.json() as {editions:{id:string;sections:{summary:string}[]}[]};
 expect(publicFeed.editions[0].id).toBe(edition.id);expect(publicFeed.editions[0].sections[0].summary).toBe(projection[0].sections[0].summary);
 expect(await readEditionDelivery(feeds,'feed-1',edition.id)).toMatchObject({verified:true,publiclyReadable:true,push:{state:'NOT_STARTED',jobState:'PENDING'}});
},30000);
it('does not create another RSS item receipt for an identical completed HTTP 200 snapshot',async()=>{
 const xml='<rss version="2.0"><channel><item><guid>unchanged-1</guid><link>https://example.com/unchanged</link><title>Unchanged report</title><description>The same source report remains available.</description></item></channel></rss>';
 const fetcher=vi.fn(async()=>new Response(xml,{status:200}));
 const backend=createConnectorRuntime(env,fetcher as typeof fetch);
 const source={scope:request.scope,configurationRevision:request.configurationRevision,url:request.source.locator,maxItems:30};
 expect((await backend.collectRss({...source,runId:'snapshot-first'})).checkpoint).toBe('ADVANCED');
 expect((await backend.collectRss({...source,runId:'snapshot-second'})).checkpoint).toBe('ADVANCED');
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_intake_receipts WHERE feed_source_id='feed-source-1'").first()).toEqual({n:1});
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM connector_batches WHERE feed_source_id='feed-source-1'").first()).toEqual({n:2});
},30000);
it('hands off bounded same-origin RSS article text with the feed excerpt preserved',async()=>{
 const article='https://example.com/story';
 const privateFetch=vi.fn(async(_url:unknown,init:RequestInit)=>{
  expect(JSON.parse(String(init.body))).toMatchObject({kind:'extract',input:{url:article}});
  return Response.json({body:'Detailed publisher article evidence. '.repeat(12)});
 });
 Object.assign(env,{SOURCE_EXECUTION_TOKEN:'local-fixture-token-01234567890123456789',SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_SERVICE:{fetch:privateFetch}});
 const publicFetch=vi.fn(async(value:unknown)=>String(value)===article?
   new Response('<article>Detailed publisher article evidence.</article>',{status:200}):
   new Response(`<rss><channel><item><guid>story-1</guid><link>${article}</link><title>Banking reform passed</title><description>Brief feed excerpt.</description></item></channel></rss>`,{status:200}));
 const backend=createConnectorRuntime(env,publicFetch as typeof fetch);
 const result=await backend.collect({...request,runId:'enriched-rss'},['rss_native']);
 expect(result.state).toBe('HANDED_OFF');
 if(result.state!=='HANDED_OFF')return;
 expect(result.request.observations[0]).toMatchObject({sourceItemKey:'id:story-1',representation:'FULL_ARTICLE',contentCompleteness:'UNKNOWN'});
 expect(result.telemetry.requests).toBe(2);
 expect(privateFetch).toHaveBeenCalledTimes(1);
 expect((await new V1IntakeStore(ctx.db).list('intake_receipts','feed-source-1'))).toHaveLength(1);
 const ref=result.request.observations[0].suppliedPayloadRef!;
 const payload=JSON.parse(new TextDecoder().decode(await backend.payloads.get(request.scope,ref)));
 expect(payload).toMatchObject({title:'Banking reform passed',excerpt:'Brief feed excerpt.',representation:'FULL_ARTICLE'});
 expect(payload.body).toContain('Detailed publisher article evidence.');
},30000);
it('suppresses unchanged RSS items when the XML snapshot changes, but emits a revised item',async()=>{
 let channelTitle='First snapshot',description='The original source report remains available.';
 const fetcher=vi.fn(async()=>new Response(`<rss version="2.0"><channel><title>${channelTitle}</title><item><guid>rss-revision-1</guid><link>https://example.com/revised</link><title>Revised report</title><description>${description}</description></item></channel></rss>`,{status:200}));
 const backend=createConnectorRuntime(env,fetcher as typeof fetch);
 const source={scope:request.scope,configurationRevision:request.configurationRevision,url:request.source.locator,maxItems:30};
 expect((await backend.collectRss({...source,runId:'rss-first'})).checkpoint).toBe('ADVANCED');
 channelTitle='Second snapshot';
 expect((await backend.collectRss({...source,runId:'rss-same-item'})).checkpoint).toBe('ADVANCED');
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_intake_receipts WHERE feed_source_id='feed-source-1'").first()).toEqual({n:1});
 description='The source report has been corrected with updated details.';
 expect((await backend.collectRss({...source,runId:'rss-changed-item'})).checkpoint).toBe('ADVANCED');
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_intake_receipts WHERE feed_source_id='feed-source-1'").first()).toEqual({n:2});
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_candidates WHERE feed_source_id='feed-source-1'").first()).toEqual({n:1});
},30000);
it('rejects stale and disabled sources before fetch, with persisted exclusive ownership across flag changes',async()=>{
 expect(await authorizeConnectorSource(env,request)).toBe(true);
 expect(await authorizeConnectorSource(env,{...request,configurationRevision:999})).toBe(false);
 expect(await isV1ProductSource({...env,V1_DOWNSTREAM_ENABLED:'false'},'feed-source-1')).toBe(true);
 await ctx.db.prepare("UPDATE sources SET enabled=0 WHERE id='feed-source-1'").run();
 const fetcher=vi.fn();await expect(createConnectorRuntime(env,fetcher).collect(request,['rss_native'])).rejects.toThrow('SOURCE_NOT_APPROVED');expect(fetcher).not.toHaveBeenCalled();
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_fetch_runs').first()).toEqual({n:0});
},15000);

it('reserves one bounded TwitterAPI.io operation and replays durable intake without another paid call',async()=>{
 const now=new Date().toISOString();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('x-source','feed-1','NASA','channel','twitterapi_io','x_profile','https://x.com/NASA',?,1,'connector',?,?,?)").bind(JSON.stringify({username:'NASA'}),now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'x-source','owner-1',now);
 Object.assign(env,{V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1,x-source',TWITTERAPI_IO_API_KEY:'synthetic-key',SOURCE_OPERATION_CEILINGS_JSON:'{"twitterApiIo":0.01,"apify":0,"zyte":0}',SOURCE_PROVIDER_BUDGETS_JSON:'{"x_twitterapi_io":0.01}'});
 const r:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'x-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'x-canary',source:{family:'x_search',locator:'from:NASA lang:en'},requestedBounds:{},limit:20};
 const fetcher=vi.fn(async(url:unknown)=>{expect(String(url)).toContain('/twitter/tweet/advanced_search');return Response.json({tweets:[{id:'123456',text:'NASA announced a new lunar science mission.',createdAt:now,lang:'en',author:{userName:'NASA'}}],has_next_page:false,next_cursor:''});});
 const backend=createConnectorRuntime(env,fetcher);await configureConnectorBudgets(env,backend);
 expect(await authorizeConnectorSource(env,{...r,source:{...r.source,locator:'from:someone_else'}})).toBe(false);
 await backend.collect(r,['x_twitterapi_io']);await backend.collect(r,['x_twitterapi_io']);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','x-source')).toMatchObject([{checkpointResolution:'RESOLVED'}]);
 expect(await ctx.db.prepare("SELECT count(*) n FROM connector_provider_operations WHERE provider_id='x_twitterapi_io'").first()).toEqual({n:1});
 const job=(await new V1IntakeStore(ctx.db).listPendingJobs('x-source')).find(j=>j.kind==='ACQUIRE')!;
 await processV1Acquisition(env,job.id);expect(await new V1IntakeStore(ctx.db).list('revisions','x-source')).toHaveLength(1);
},30000);
it('schedules a new X poll only in the next hourly window without sending a paid request',async()=>{
 const now=new Date('2026-10-08T12:05:00Z'),stamp=now.toISOString();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('x-poll','feed-1','NASA','channel','twitterapi_io','x_profile','https://x.com/NASA',?,1,'connector',?,?,?)").bind(JSON.stringify({username:'NASA'}),stamp,stamp,stamp).run();
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='x-poll';
 await runConnectorMaintenance(env,now);
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_poll_jobs").first()).toEqual({n:0});
 env.SOURCE_OPERATION_CEILINGS_JSON='{"twitterApiIo":0.01,"apify":0,"zyte":0}';
 env.SOURCE_PROVIDER_BUDGETS_JSON='{"x_twitterapi_io":0.01}';
 await runConnectorMaintenance(env,now);
 await runConnectorMaintenance(env,new Date('2026-10-08T12:06:00Z'));
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_poll_jobs").first()).toEqual({n:1});
 await runConnectorMaintenance(env,new Date('2026-10-08T13:05:00Z'));
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_poll_jobs").first()).toEqual({n:2});
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_operations").first()).toEqual({n:0});
 expect(await ctx.db.prepare("SELECT limit_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").first()).toEqual({limit_usd:0.01});
},30000);
it('rejects unknown or invalid aggregate provider budgets before dispatch',async()=>{
 const backend=createConnectorRuntime(env);
 for(const budgets of ['{"other":1}','{"x_twitterapi_io":-1}','{"x_twitterapi_io":"1"}']){
  env.SOURCE_PROVIDER_BUDGETS_JSON=budgets;
  await expect(configureConnectorBudgets(env,backend)).rejects.toThrow('INVALID_SOURCE_BUDGETS');
 }
 expect(await ctx.db.prepare("SELECT COUNT(*) n FROM connector_provider_operations").first()).toEqual({n:0});
},15000);
it('admits only the approved LinkedIn actor and matching company identity',async()=>{
 const url='https://www.linkedin.com/company/microsoft/';
 const approved={provider:'apify',kind:'linkedin_company',input:`linkedin: ${url}`,source_url:url,actor_id:TESTED_ACTORS.linkedin_company};
 expect(productConnectorSource(approved)).toMatchObject({source:{family:'linkedin_company',locator:url},limit:20});
 expect(productConnectorSource({...approved,actor_id:'other/actor'})).toBeUndefined();
 expect(productConnectorSource({...approved,source_url:'https://www.linkedin.com/company/other/'})).toBeUndefined();
 expect(productConnectorSource({...approved,source_url:'https://example.com/company/microsoft/'})).toBeUndefined();
 const now=new Date().toISOString();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,actor_id,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('linkedin-source','feed-1','Microsoft','channel','apify','linkedin_company',?,?,?,1,'connector',?,?,?)").bind(url,approved.input,approved.actor_id,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'linkedin-source','owner-1',now);
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='linkedin-source';
 const r:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'linkedin-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'linkedin-canary',source:{family:'linkedin_company',locator:url},requestedBounds:{},limit:20};
 expect(await authorizeConnectorSource(env,r)).toBe(true);
 expect(await authorizeConnectorSource(env,{...r,source:{...r.source,locator:'https://www.linkedin.com/company/other/'}})).toBe(false);
},15000);
it('maps approved X profile and topic inputs to their exact connector identities',async()=>{
 const profile={provider:'apify',kind:'x_profile',input:'x: NASA',source_url:'https://x.com/NASA',actor_id:TESTED_ACTORS.x};
 expect(productConnectorSource(profile)).toMatchObject({source:{family:'x_profile',locator:'NASA'},limit:20});
 expect(productConnectorSource({...profile,actor_id:'other/actor'})).toBeUndefined();
 expect(productConnectorSource({...profile,source_url:'https://x.com/Other'})).toBeUndefined();
 const topic={provider:'apify',kind:'x_search',input:'x: Lebanon electricity',source_url:null,actor_id:TESTED_ACTORS.x};
 expect(productConnectorSource(topic)).toMatchObject({source:{family:'x_search',locator:'Lebanon electricity'},limit:20});
 expect(productConnectorSource({...topic,source_url:'https://x.com/NASA'})).toBeUndefined();
 const now=new Date().toISOString();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,actor_id,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('x-topic','feed-1','Lebanon electricity','channel','apify','x_search',NULL,?,?,1,'connector',?,?,?)").bind(topic.input,topic.actor_id,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'x-topic','owner-1',now);
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='x-topic';
 expect(await authorizeConnectorSource(env,{scope:{feedId:'feed-1',feedSourceId:'x-topic',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'topic-run',source:{family:'x_search',locator:'Lebanon electricity'},requestedBounds:{},limit:20})).toBe(true);
},15000);
it('checks recovery candidates once per feed and only probes a source with blocked work',async()=>{
 const ids=['google-a','google-b'],now=testPolicy.now();
 for(const id of ids){
  const url=buildGoogleNewsRssUrl(id,{geo:'US',language:'en'});
  await ctx.db.prepare(`INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at)
   VALUES(?,'feed-1','Google News','channel','rss','google_news',?,?,1,'connector',?,?,?)`).bind(id,url,'news: '+id,now,now,now).run();
 }
 await ctx.db.prepare(`INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,state,last_error)
   VALUES('blocked-google',?,'hash','[]',?,'BLOCKED','UNCERTAIN_PAID_SUBMISSION')`)
   .bind(JSON.stringify({scope:{feedId:'feed-1',feedSourceId:ids[1]}}),now).run();
 const measured=profileD1(ctx.db);
 await runConnectorMaintenance({...env,DB:measured.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',
  APIFY_API_TOKEN:'fixture-only',V1_DOWNSTREAM_FEED_SOURCE_IDS:ids.join(',')},new Date(now),{scheduleOnly:true,feedId:'feed-1'});
 const discovery=measured.log.filter(entry=>entry.sql.includes('SELECT DISTINCT json_extract(request'));
 expect(discovery).toHaveLength(1);
 const probes=measured.log.filter(entry=>entry.sql.includes('SELECT p.job_id FROM connector_provider_poll_jobs p'));
 expect(probes.map(entry=>entry.binds.slice(0,2))).toEqual([['feed-1','google-b']]);
});
it('accepts an approved Google News query through the free RSS path and rejects a changed query URL',async()=>{
 const now=new Date().toISOString(),url=buildGoogleNewsRssUrl('Lebanon electricity',{geo:'US',language:'en'});
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('google-source','feed-1','Google News','channel','rss','google_news',?,?,1,'connector',?,?,?)").bind(url,'news: Lebanon electricity',now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'google-source','owner-1',now);
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='feed-source-1,google-source';
 const r:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'google-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'google-run',source:{family:'google_news',locator:'Lebanon electricity',language:'en',region:'US'},requestedBounds:{},limit:30};
 let headline='Lebanon electricity update';
 const fetcher=vi.fn(async(value:unknown)=>{expect(String(value)).toBe(url);return new Response(`<rss version="2.0"><channel><title>Google News</title><item><guid>google-1</guid><link>https://publisher.example/news/1</link><source url="https://publisher.example">Publisher</source><title>${headline}</title><description>Electricity grid repairs began today.</description><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`,{headers:{'content-type':'application/rss+xml'}})});
 const backend=createConnectorRuntime(env,fetcher as typeof fetch);
 expect(await authorizeConnectorSource(env,r)).toBe(true);
 expect(await authorizeConnectorSource(env,{...r,source:{...r.source,locator:'unapproved topic'}})).toBe(false);
 expect(productConnectorSource({provider:'rss',kind:'google_news',input:'news: Lebanon electricity',source_url:buildGoogleNewsRssUrl('unapproved topic')})).toBeUndefined();
 const first=await backend.collect(r,['google_rss']);if(first.state==='FETCH_FAILED')throw new Error('Google News fixture fetch failed');expect(first.checkpoint).toBe('UNCHANGED');
 await backend.collect(r,['google_rss']);expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','google-source')).toMatchObject([{checkpointResolution:'RESOLVED'}]);
 const same=await backend.collect({...r,runId:'google-unchanged'},['google_rss']);
 if(same.state==='FETCH_FAILED')throw new Error('Unchanged Google fixture failed');
 expect(same.request.observations).toHaveLength(0);
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','google-source')).toHaveLength(1);
 expect(fetcher).toHaveBeenCalledTimes(2);
 headline='Lebanon electricity update revised';
 const changed=await backend.collect({...r,runId:'google-changed'},['google_rss']);
 if(changed.state==='FETCH_FAILED')throw new Error('Changed Google fixture failed');
 expect(changed.request.observations).toHaveLength(1);
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','google-source')).toHaveLength(2);
 expect(await new V1IntakeStore(ctx.db).list('candidates','google-source')).toHaveLength(1);
},30000);
it('hands a resolved Google News publisher URL to intake while retaining the listing representation',async()=>{
 const now=new Date().toISOString(),query='Lebanon electricity',url=buildGoogleNewsRssUrl(query,{geo:'US',language:'en'});
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('google-redirect','feed-1','Google News','channel','rss','google_news',?,?,1,'connector',?,?,?)").bind(url,`news: ${query}`,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'google-redirect','owner-1',now);
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='feed-source-1,google-redirect';
 const article='https://news.google.com/rss/articles/opaque';
 const fetcher=vi.fn(async(value:unknown)=>String(value)===article?
   new Response(null,{status:302,headers:{Location:'https://publisher.example/article?utm_source=google&edition=us'}}):
   new Response(`<rss><channel><item><guid>google-item</guid><link>${article}</link><source url="https://publisher.example">Publisher</source><title>Electricity update</title><description>Repairs began.</description></item></channel></rss>`,{status:200}));
 const backend=createConnectorRuntime(env,fetcher as typeof fetch);
 const result=await backend.collect({scope:{feedId:'feed-1',feedSourceId:'google-redirect',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,
   runId:'google-redirect-run',source:{family:'google_news',locator:query,language:'en',region:'US'},requestedBounds:{},limit:30},['google_rss']);
 expect(result.state).toBe('HANDED_OFF');
 if(result.state!=='HANDED_OFF')return;
 expect(result.request.observations[0]).toMatchObject({sourceItemKey:'id:google-item',canonicalUrl:'https://publisher.example/article?edition=us',publisherId:'publisher.example',representation:'LISTING_RESULT'});
 expect(result.telemetry.requests).toBe(2);
 expect(fetcher.mock.calls.map(([value])=>new URL(String(value)).hostname)).toEqual(['news.google.com','news.google.com']);
},30000);
it('continues a Google News snapshot across bounded scheduler ticks',async()=>{
 const now=new Date().toISOString(),url=buildGoogleNewsRssUrl('Lebanon electricity',{geo:'US',language:'en'});
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('google-paged','feed-1','Google News','channel','rss','google_news',?,?,1,'connector',?,?,?)").bind(url,'news: Lebanon electricity',now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'google-paged','owner-1',now);
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS='google-paged';
 const request:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'google-paged',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'google-paged-run',source:{family:'google_news',locator:'Lebanon electricity',language:'en',region:'US'},requestedBounds:{},limit:30};
 const items=Array.from({length:35},(_,index)=>`<item><guid>google-${index}</guid><link>https://publisher.example/news/${index}</link><source url="https://publisher.example">Publisher</source><title>Lebanon electricity update ${index}</title><description>Electricity grid repairs continued in Lebanon today.</description><pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate></item>`).join('');
 const fetcher=vi.fn(async()=>new Response(`<rss version="2.0"><channel><title>Google News</title>${items}</channel></rss>`,{headers:{'content-type':'application/rss+xml'}}));
 const backend=createConnectorRuntime(env,fetcher as typeof fetch);
 await backend.scheduler.schedule('google-paged-job',request,now,['google_rss']);
 expect(await backend.scheduler.runOne()).toBe('RETRY');
 expect(await backend.scheduler.runOne()).toBe('DONE');
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(await ctx.db.prepare("SELECT COUNT(*) AS n FROM v1_intake_receipts WHERE feed_source_id='google-paged'").first()).toEqual({n:35});
},30000);
it.each([false,true])('hands off an approved website while preserving the native execution preference: %s',async native=>{
 const now=new Date().toISOString(),url='https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('website-source','feed-1','Book page','channel','web','web_page',?,?,1,'connector',?,?,?)").bind(url,url,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'website-source','owner-1',now);
 const privateFetch=vi.fn(async(_url:unknown,init:RequestInit)=>{
  expect(JSON.parse(String(init.body))).toMatchObject({kind:'extract',input:{url}});
  return Response.json({title:'A Light in the Attic',body:'A long enough extracted page body. '.repeat(10)});
 });
 Object.assign(env,{V1_DOWNSTREAM_FEED_SOURCE_IDS:'website-source',SOURCE_NATIVE_EXECUTION_ENABLED:native?'true':'false',SOURCE_EXECUTION_TOKEN:'local-fixture-token-01234567890123456789',SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_SERVICE:{fetch:privateFetch}});
 const publicFetch=vi.fn(async()=>new Response('<html><title>A Light in the Attic</title><body><article><h1>A Light in the Attic</h1><p>'+ 'A long enough extracted page body. '.repeat(10)+'</p></article></body></html>',{status:200}));
 const r:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'website-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'website-run',source:{family:'website',locator:url},requestedBounds:{},limit:1};
 const backend=createConnectorRuntime(env,publicFetch as typeof fetch);
 expect(await authorizeConnectorSource(env,r)).toBe(true);
 const result=await backend.collect(r,['website_http']);
 if(result.state==='FETCH_FAILED')throw new Error('Website fixture fetch failed');
 expect(result.request.proposals).toHaveLength(1);
 expect(result.request.observations[0]).toMatchObject({sourceItemKey:`url:${url}`,representation:'FULL_ARTICLE'});
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','website-source')).toHaveLength(1);
 expect(publicFetch).toHaveBeenCalledTimes(1);expect(privateFetch).toHaveBeenCalledTimes(native?0:1);
},30000);
it('routes bounded approved Telegram through VPC, durable intake, evidence and publication without public fallback',async()=>{
 const now=new Date().toISOString(),input=JSON.stringify({username:'telegram',channelId:'-100123',public:true});
 await ctx.db.prepare("INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('telegram-feed','owner-1','telegram','Telegram','platform changes',1,?,?)").bind(now,now).run();
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('telegram-source','telegram-feed','Telegram','channel','telegram','telegram_channel','https://t.me/telegram',?,1,'connector',?,?,?)").bind(input,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'telegram-source','owner-1',now);
 const privateFetch=vi.fn(async(_url:unknown,init:RequestInit)=>{
  expect(JSON.parse(String(init.body))).toMatchObject({kind:'telethon',input:{channelId:'-100123',limit:3,afterId:0}});
  return Response.json({channelId:'-100123',records:[{id:1,text:'Telegram announced stronger account verification protections.',publishedAt:now}],orderedFromCheckpoint:true,exhausted:true});
 });
 const publicFetch=vi.fn();Object.assign(env,{V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1,telegram-source',SOURCE_EXECUTION_TOKEN:'local-fixture-token-01234567890123456789',SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_SERVICE:{fetch:privateFetch}});
 const r:SourceFetchRequest={scope:{feedId:'telegram-feed',feedSourceId:'telegram-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'telegram-run',source:{family:'telegram',locator:'telegram',channelId:'-100123',public:true},requestedBounds:{},limit:3};
 const backend=createConnectorRuntime(env,publicFetch);
 expect(await authorizeConnectorSource(env,r)).toBe(true);
 expect(await authorizeConnectorSource(env,{...r,source:{...r.source,channelId:'-100999'}})).toBe(false);
 const result=await backend.collect(r,['telegram_telethon']);
 if(result.state==='FETCH_FAILED')throw new Error('Telegram fixture fetch failed');
 expect(result.checkpoint).toBe('ADVANCED');
 const scheduled=vi.fn(async(id:string,request:SourceFetchRequest,due:string,order?:readonly string[])=>backend.scheduler.schedule(id,request,due,order));
 expect(await scheduleRecentTelegramRecheck(ctx.db,{schedule:scheduled},r,new Date(now))).toBe(true);
 expect(scheduled.mock.calls[0][1]).toMatchObject({source:r.source,recheckItemKeys:['telegram:-100123:1']});
 expect(scheduled.mock.calls[0][3]).toEqual(['telegram_telethon']);
 await backend.collect(r,['telegram_telethon']);expect(privateFetch).toHaveBeenCalledTimes(1);expect(publicFetch).not.toHaveBeenCalled();
 const intake=new V1IntakeStore(ctx.db);expect(await intake.list('intake_receipts','telegram-source')).toHaveLength(1);
 const job=(await intake.listPendingJobs('telegram-source')).find(j=>j.kind==='ACQUIRE')!;await processV1Acquisition(env,job.id);
 const reassess=(await intake.listPendingJobs('telegram-source')).find(j=>j.kind==='REASSESS')!;const store=new V1FeedStore(ctx.db);
 const model=v3Fixture('Telegram announced stronger account verification protections.');
 await processV1Reassessment(env,reassess.id,new Date().toISOString());
 const end=new Date(Date.now()+60000).toISOString();const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'telegram-feed',window:{start:new Date(Date.now()-3600000).toISOString(),end,kind:'HOURLY'}},()=>end,undefined,model);
 expect(edition?.stories).toHaveLength(1);expect(edition?.evidenceRevisionIds).toHaveLength(1);
 expect(edition?.engine).toBe('v3');expect(model).toHaveBeenCalledTimes(2);expect(publicFetch).not.toHaveBeenCalled();
},30000);


it('preserves saved operator authorizations and reservations without automatically increasing or refilling them',async()=>{
 env.SOURCE_QUEUE_SCHEDULING_ENABLED='true';env.SOURCE_PER_PROVIDER_BUDGET_USD='15';env.SOURCE_PROVIDER_BUDGETS_JSON=JSON.stringify({x_twitterapi_io:15,x_apify:15});
 const runtime=createConnectorRuntime(env);
 await runtime.paidHttp.configureLimit('x_twitterapi_io',0);
 await ctx.db.prepare("UPDATE connector_provider_budgets SET reserved_usd=2 WHERE provider_id='x_twitterapi_io'").run();
 await configureConnectorBudgets(env,runtime);
 expect(await ctx.db.prepare("SELECT limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").first()).toEqual({limit_usd:0,reserved_usd:2});
 await configureConnectorBudgets(env,runtime);
 expect(await ctx.db.prepare("SELECT limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id='x_twitterapi_io'").first()).toEqual({limit_usd:0,reserved_usd:2});
 expect(await ctx.db.prepare("SELECT limit_usd FROM connector_provider_budgets WHERE provider_id='zyte'").first()).toEqual({limit_usd:0});
});

it('a rollout preserves an existing thirty-item RSS poll identity and resumes its frozen request',async()=>{
 const now=new Date(testPolicy.now()),id=await sha256(JSON.stringify(['feed-source-1',request.configurationRevision,Math.floor(now.getTime()/300000)]));
 const frozen={scope:request.scope,runId:id,configurationRevision:request.configurationRevision,url:request.source.locator,requestedBounds:{},maxItems:30};
 await createConnectorRuntime(env).rssScheduler.schedule(id,frozen,now.toISOString());
 await expect(runConnectorMaintenance(env,now,{scheduleOnly:true})).resolves.toBeDefined();
 const rows=await ctx.db.prepare('SELECT request FROM connector_rss_poll_jobs WHERE job_id=?').bind(id).all<{request:string}>();
 expect(rows.results).toHaveLength(1);expect(JSON.parse(rows.results[0].request)).toEqual(frozen);
},30000);
