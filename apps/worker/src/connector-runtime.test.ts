import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,testPolicy} from './v1-intake/test-utils';
import {enrollV1Source,isV1ProductSource} from './v1-intelligence/product';
import {authorizeConnectorSource,createConnectorRuntime} from './connector-runtime';
import {processV1Acquisition} from './v1-downstream-runtime';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore} from './v1-intelligence/store';
import {processEvidenceIntelligence} from './v1-intelligence/engine';
import {processV1Briefing} from './v1-intelligence/runtime';
import type {SourceFetchRequest} from '@distilled/connectors';
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
it('migrates empty D1 and connects RSS through receipts, acquisition, intelligence, plan and grounded immutable publication',async()=>{
 const fetcher=vi.fn(async()=>new Response('<rss version="2.0"><channel><title>News</title><item><guid>banking-1</guid><link>https://example.com/news/1</link><title>Lebanon banking reform</title><description>Lebanon Parliament approved banking reform legislation.</description><pubDate>Sat, 03 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}}));
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
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:{start:'2026-10-01T00:00:00Z',end:now,kind:'DAILY' as const}};
 const edition=(await processV1Briefing(env,message,()=>now))!;
 expect((await feeds.list('feed-1','editorial_plans')).length).toBeGreaterThan(0);
 expect(edition.stories).toHaveLength(1);expect(edition.evidenceRevisionIds).toHaveLength(1);
 expect(edition.stories[0].claims[0].support[0].evidenceRevisionId).toBe(edition.evidenceRevisionIds[0]);
 expect(await processV1Briefing(env,message,()=>now)).toEqual(edition);expect(await feeds.list('feed-1','editions')).toHaveLength(1);
},30000);
it('rejects stale and disabled sources before fetch, with persisted exclusive ownership across flag changes',async()=>{
 expect(await authorizeConnectorSource(env,request)).toBe(true);
 expect(await authorizeConnectorSource(env,{...request,configurationRevision:999})).toBe(false);
 expect(await isV1ProductSource({...env,V1_DOWNSTREAM_ENABLED:'false'},'feed-source-1')).toBe(true);
 await ctx.db.prepare("UPDATE sources SET enabled=0 WHERE id='feed-source-1'").run();
 const fetcher=vi.fn();await expect(createConnectorRuntime(env,fetcher).collect(request,['rss_native'])).rejects.toThrow('SOURCE_NOT_APPROVED');expect(fetcher).not.toHaveBeenCalled();
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_fetch_runs').first()).toEqual({n:0});
},15000);

