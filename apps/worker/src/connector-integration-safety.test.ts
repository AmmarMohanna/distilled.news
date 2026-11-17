import {beforeEach,afterEach,expect,it} from 'vitest';
import {createIntakeDatabase,testPolicy} from './v1-intake/test-utils';
import {enrollV1Source} from './v1-intelligence/product';
import {authorizeConnectorSource,runConnectorMaintenance} from './connector-runtime';
import {coalescedProcessingQueue,connectorDownstreamEnv,dispatchConnectorFeeds,processConnectorMessage} from './connector-scheduling';
import type {SourceFetchRequest} from '@distilled/connectors';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env,request:SourceFetchRequest;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('safety-owner','safety@example.invalid','safety@example.invalid','safety-owner','user','hash','2026-10-13','2026-10-13','2026-10-13'),('replacement-owner','replacement@example.invalid','replacement@example.invalid','replacement-owner','user','hash','2026-10-13','2026-10-13','2026-10-13'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('safety-feed','safety-owner','safety','Safety','news',1,'2026-10-13','2026-10-13'); INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('safety-source','safety-feed','RSS','channel','rss','rss_feed','https://example.com/feed',1,'connector','2026-10-13','2026-10-13','2026-10-13');");
 const enrolled=await enrollV1Source(ctx.db,'safety-source','safety-owner',testPolicy.now());
 const queue={send:async()=>{},sendBatch:async()=>{}};
 env={DB:ctx.db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true',SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',PRODUCT_FEEDS_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'safety-source',SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue,PROCESSING_QUEUE:queue,RAW_ARCHIVE:{}} as unknown as Env;
 request={scope:{feedId:'safety-feed',feedSourceId:'safety-source',sourceId:enrolled.scope.sourceId},configurationRevision:enrolled.scope.feedRevision,runId:'safety-run',source:{family:'rss',locator:'https://example.com/feed'},requestedBounds:{},limit:30};
});
afterEach(async()=>ctx?.dispose());
it.each(['SOURCE_COLLECTION_QUEUE','V1_PROCESSING_QUEUE','V1_ACQUISITION_QUEUE'] as const)('incomplete queue mode rejects %s before reserving or dispatching work',async binding=>{
 const incomplete={...env,[binding]:undefined};
 expect(()=>coalescedProcessingQueue(incomplete)).toThrow(binding+'_REQUIRED');
 await expect(dispatchConnectorFeeds(incomplete)).rejects.toThrow(binding+'_REQUIRED');
 await expect(processConnectorMessage(incomplete,{type:'connector_feed',feedId:'safety-feed',token:'missing'})).rejects.toThrow(binding+'_REQUIRED');
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_queue_dispatch').first()).toEqual({n:0});
});
it('a queued source list cannot reclaim a source transferred to the legacy collector',async()=>{
 await ctx.db.prepare("UPDATE sources SET collection_owner='legacy' WHERE id='safety-source'").run();
 const result=await runConnectorMaintenance(env,new Date(testPolicy.now()),{scheduleOnly:true});
 expect(result?.scheduled).toEqual([]);
 expect(await ctx.db.prepare("SELECT collection_owner FROM sources WHERE id='safety-source'").first()).toEqual({collection_owner:'legacy'});
 expect(await ctx.db.prepare('SELECT COUNT(*) AS n FROM connector_rss_poll_jobs').first()).toEqual({n:0});
});
it('a changed product owner cannot authorize transport under an old canonical owner',async()=>{
 await ctx.db.prepare("UPDATE briefings SET owner_account_id='replacement-owner' WHERE id='safety-feed'").run();
 expect(await authorizeConnectorSource(env,request)).toBe(false);
});
it('queued intelligence rejects a product owner that differs from its canonical feed',async()=>{
 await ctx.db.prepare("UPDATE briefings SET owner_account_id='replacement-owner' WHERE id='safety-feed'").run();
 let code:string|undefined;
 try{await connectorDownstreamEnv(env,{type:'v1_rematch',feedId:'safety-feed',requestId:'saved-rematch'});}catch(error){code=(error as {code?:string}).code;}
 expect(code).toBe('SCOPE_DENIED');
});
