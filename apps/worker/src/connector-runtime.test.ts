import {publishedProductEditions} from './product-feeds';
import {HandoffError,sha256} from '@distilled/contracts';
import {D1Repository} from './repository';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,testPolicy} from './v1-intake/test-utils';
import {enrollV1Source,isV1ProductSource} from './v1-intelligence/product';
import {authorizeConnectorSource,configureConnectorBudgets,createConnectorRuntime,runConnectorMaintenance,scheduleRecentTelegramRecheck,scheduleProviderWindow} from './connector-runtime';
import {productConnectorSource} from './connector-source';
import {processV1Acquisition} from './v1-downstream-runtime';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore} from './v1-intelligence/store';
import {processEvidenceIntelligence} from './v1-intelligence/engine';
import {processV1Briefing} from './v1-intelligence/runtime';
import type {SourceFetchRequest} from '@distilled/connectors';
import {buildGoogleNewsRssUrl,TESTED_ACTORS,D1ProviderPollScheduler,sourceSqlFromD1} from '@distilled/connectors';
import type {Env} from './types';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,request:SourceFetchRequest;
const objects=new Map<string,Uint8Array>();
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
it('migrates empty D1 and connects RSS through receipts, acquisition, intelligence, plan and grounded immutable publication',async()=>{
 const publishedAt=new Date(Date.now()-3600000).toUTCString();
 const fetcher=vi.fn(async()=>new Response(`<rss version="2.0"><channel><title>News</title><item><guid>banking-1</guid><link>https://example.com/news/1</link><title>Lebanon Parliament approved banking reform legislation</title><description>Lebanon Parliament approved banking reform legislation</description><pubDate>${publishedAt}</pubDate></item></channel></rss>`,{headers:{'content-type':'application/rss+xml'}}));
 const runtime=createConnectorRuntime(env,fetcher as typeof fetch);
 const rss={scope:request.scope,configurationRevision:request.configurationRevision,runId:request.runId,url:request.source.locator,maxItems:30};
 const first=await runtime.collectRss(rss);expect(first.checkpoint).toBe('ADVANCED');
 const replay=await runtime.collectRss(rss);expect(replay.checkpoint).toBe('UNCHANGED');expect(fetcher).toHaveBeenCalledTimes(1);expect(objects.size).toBeGreaterThan(1);
 const intake=new V1IntakeStore(ctx.db);expect(await intake.list('intake_receipts','feed-source-1')).toMatchObject([{checkpointResolution:'RESOLVED'}]);expect(await intake.list('candidates','feed-source-1')).toHaveLength(1);
 const job=(await intake.listPendingJobs('feed-source-1')).find(j=>j.kind==='ACQUIRE')!;
 await processV1Acquisition(env,job.id);expect(await intake.list('revisions','feed-source-1')).toHaveLength(1);
 await processV1Acquisition(env,job.id);expect(await intake.list('revisions','feed-source-1')).toHaveLength(1);
 const feeds=new V1FeedStore(ctx.db),now=new Date(Date.now()+60000).toISOString();
 const reassess=(await intake.listPendingJobs('feed-source-1')).find(j=>j.kind==='REASSESS')!;
 await processEvidenceIntelligence(feeds,reassess.id,new Date().toISOString());expect(await feeds.list('feed-1','events')).toHaveLength(1);expect(await feeds.list('feed-1','storylines')).toHaveLength(1);
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:{start:new Date(Date.parse(now)-86400000).toISOString(),end:now,kind:'DAILY' as const}};
 const edition=(await processV1Briefing(env,message,()=>now))!;
 expect((await feeds.list('feed-1','editorial_plans')).length).toBeGreaterThan(0);
 const projection=await publishedProductEditions(env,(await new D1Repository(ctx.db).getBriefingById("feed-1"))!);
 expect(projection).toHaveLength(1);expect(projection[0].sections[0].summary).toBe(edition.stories[0].claims.map(c=>c.text).join(" "));expect(projection[0].sections[0].evidence[0].sourceUrl).toBe("https://example.com/news/1");
 expect(edition.stories).toHaveLength(1);expect(edition.evidenceRevisionIds).toHaveLength(1);
 expect(edition.stories[0].claims[0].support[0].evidenceRevisionId).toBe(edition.evidenceRevisionIds[0]);
 expect(await processV1Briefing(env,message,()=>now)).toEqual(edition);expect(await feeds.list('feed-1','editions')).toHaveLength(1);
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
it('hands off an approved website through direct HTTP and private text extraction',async()=>{
 const now=new Date().toISOString(),url='https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html';
 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('website-source','feed-1','Book page','channel','web','web_page',?,?,1,'connector',?,?,?)").bind(url,url,now,now,now).run();
 const enrolled=await enrollV1Source(ctx.db,'website-source','owner-1',now);
 const privateFetch=vi.fn(async(_url:unknown,init:RequestInit)=>{
  expect(JSON.parse(String(init.body))).toMatchObject({kind:'extract',input:{url}});
  return Response.json({title:'A Light in the Attic',body:'A long enough extracted page body. '.repeat(10)});
 });
 Object.assign(env,{V1_DOWNSTREAM_FEED_SOURCE_IDS:'website-source',SOURCE_EXECUTION_TOKEN:'local-fixture-token-01234567890123456789',SOURCE_EXECUTION_URL:'http://127.0.0.1:8790/v1/source-execution',SOURCE_EXECUTION_SERVICE:{fetch:privateFetch}});
 const publicFetch=vi.fn(async()=>new Response('<html><title>A Light in the Attic</title><body>Books to Scrape</body></html>',{status:200}));
 const r:SourceFetchRequest={scope:{feedId:'feed-1',feedSourceId:'website-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'website-run',source:{family:'website',locator:url},requestedBounds:{},limit:1};
 const backend=createConnectorRuntime(env,publicFetch as typeof fetch);
 expect(await authorizeConnectorSource(env,r)).toBe(true);
 const result=await backend.collect(r,['website_http']);
 if(result.state==='FETCH_FAILED')throw new Error('Website fixture fetch failed');
 expect(result.request.proposals).toHaveLength(1);
 expect(result.request.observations[0]).toMatchObject({sourceItemKey:`url:${url}`,representation:'FULL_ARTICLE'});
 expect(await new V1IntakeStore(ctx.db).list('intake_receipts','website-source')).toHaveLength(1);
 expect(publicFetch).toHaveBeenCalledTimes(1);expect(privateFetch).toHaveBeenCalledTimes(1);
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
 const scheduled=vi.fn(async(_id:string,_request:SourceFetchRequest,_due:string,_order?:readonly string[])=>{});
 expect(await scheduleRecentTelegramRecheck(ctx.db,{schedule:scheduled},r,new Date(now))).toBe(true);
 expect(scheduled.mock.calls[0][1]).toMatchObject({source:r.source,recheckItemKeys:['telegram:-100123:1']});
 expect(scheduled.mock.calls[0][3]).toEqual(['telegram_telethon']);
 await backend.collect(r,['telegram_telethon']);expect(privateFetch).toHaveBeenCalledTimes(1);expect(publicFetch).not.toHaveBeenCalled();
 const intake=new V1IntakeStore(ctx.db);expect(await intake.list('intake_receipts','telegram-source')).toHaveLength(1);
 const job=(await intake.listPendingJobs('telegram-source')).find(j=>j.kind==='ACQUIRE')!;await processV1Acquisition(env,job.id);
 const reassess=(await intake.listPendingJobs('telegram-source')).find(j=>j.kind==='REASSESS')!;const store=new V1FeedStore(ctx.db);
 await processEvidenceIntelligence(store,reassess.id,new Date().toISOString());
 const end=new Date(Date.now()+60000).toISOString();const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'telegram-feed',window:{start:new Date(Date.now()-3600000).toISOString(),end,kind:'HOURLY'}},()=>end);
 expect(edition?.stories).toHaveLength(1);expect(edition?.evidenceRevisionIds).toHaveLength(1);
},30000);

