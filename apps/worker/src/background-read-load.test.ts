import {expect,it,vi} from 'vitest';
vi.mock('./cloudflare-container-browser',()=>({AuthenticatedBrowserContainer:class {}}));
import worker from './index';
import {createSession} from './auth';
import {dispatchConnectorFeeds,processConnectorMessage,type ConnectorQueueMessage} from './connector-scheduling';
import {D1Repository} from './repository';
import {profileD1} from './perf/d1-profile';
import {feedId,feedSlug,OWNER,seedQaShape} from './perf/qa-shape';
import type {Env} from './types';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {V1FeedStore} from './v1-intelligence/store';

it('keeps signed-in session and feed reads available during indexed connector dispatch and evidence validation',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  const {db}=ctx;
  const {owner}=await seedQaShape(db,{feeds:1,heavyJobs:4,jobsPerFeed:1,editionsHeavy:2,editionsPerFeed:1,citationsPerEdition:1,requestsPerFeed:1,pollsPerSource:1});
  const feed=feedId(0), scope=feed+'::rss_1';
  const numbers=(n:number)=>`WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<${n})`;
  await db.prepare(`${numbers(1000)} INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,created_at,updated_at)
   SELECT 'load-'||i,i||'@example.invalid',i||'@example.invalid','load-'||i,'user','unused','2026-01-01','2026-01-01' FROM seq`).run();
  await db.prepare(`INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at)
   SELECT id,id,'news','News','News',1,created_at,updated_at FROM accounts WHERE id LIKE 'load-%'`).run();
  await db.prepare(`INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at)
   SELECT id||'-rss',id,'RSS','channel','rss','rss_feed','https://example.invalid/rss',1,'connector',updated_at,created_at,updated_at
   FROM briefings WHERE id LIKE 'load-%'`).run();
  await db.prepare(`${numbers(4000)} INSERT INTO v1_revisions(id,feed_source_id,item_key,json)
   SELECT 'rev-'||i,?,'item-'||i,json_object('evidenceId','item-'||i,'revision',1) FROM seq`).bind(scope).run();
  await db.prepare(`${numbers(4000)} INSERT INTO v1_evidence(id,feed_source_id,item_key,json)
   SELECT 'item-'||i,?,'item-'||i,json_object('state','ACTIVE','currentRevisionId','rev-'||i) FROM seq`).bind(scope).run();

  const legacy=await db.prepare(`SELECT r.id FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id
   JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=?
   AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL`).bind(feed).all();
  expect(legacy.results).toHaveLength(4000);
  await db.prepare("UPDATE briefings SET public_feed_enabled=0 WHERE id='load-1'").run();
  const measured=profileD1(db),store=new V1FeedStore(measured.db);
  expect(await store.activeEvidenceRevisionIds(feed,['rev-9','rev-4000'])).toEqual(new Set(['rev-9','rev-4000']));
  const bounded=measured.log[0];
  const plan=await db.prepare('EXPLAIN QUERY PLAN '+bounded.sql).bind(...bounded.binds).all<{detail:string}>();
  expect(plan.results.map(row=>row.detail).join('\n')).toMatch(/SEARCH e USING INDEX v1_active_evidence_revision_scope/);
  expect(bounded.rowsRead).toBeLessThan(legacy.meta.rows_read/100);

  const listingProfile=profileD1(db);
  await new D1Repository(listingProfile.db).listExploreBriefings(101);
  const listing=listingProfile.log[0];
  const listingPlan=await db.prepare('EXPLAIN QUERY PLAN '+listing.sql).bind(...listing.binds).all<{detail:string}>();
  const listingSteps=listingPlan.results.map(row=>row.detail).join('\n');
  expect(listingSteps).toContain('briefings_public_explore_rank');
  expect(listingSteps).not.toContain('TEMP B-TREE FOR ORDER BY');

  const deliveries:ConnectorQueueMessage[]=[];
  const queue={send:async()=>{},sendBatch:async(batch:{body:ConnectorQueueMessage}[])=>{
   deliveries.push(...batch.map(message=>message.body).filter(body=>body.type==='connector_feed'));
  }};
  const env={DB:db,ADMIN_SESSION_SECRET:'load-test-secret',PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',
   SOURCE_CONNECTORS_ENABLED:'true',V1_DOWNSTREAM_ENABLED:'true',BRIEFING_ENGINE:'v3',
   SOURCE_COLLECTION_QUEUE:queue,V1_PROCESSING_QUEUE:queue,V1_ACQUISITION_QUEUE:queue,PROCESSING_QUEUE:queue} as unknown as Env;
  const headers={cookie:'dn_session='+await createSession(env.ADMIN_SESSION_SECRET!,owner)};
  const timings:Record<string,number[]>={session:[],feed:[],explore:[]};
  async function read(kind:'session'|'feed'){
   const path=kind==='session'?'/api/auth/session':`/api/feed/${OWNER}/${feedSlug(0)}`;
   const started=performance.now();
   const response=await worker.fetch(new Request('https://distilled.test'+path,{headers}),env,{} as ExecutionContext);
   expect(response.status).toBe(200);
   const body=await response.json() as {authenticated?:boolean;account?:{id:string};editions?:unknown[]};
   if(kind==='session'){expect(body.authenticated).toBe(true);expect(body.account?.id).toBe(owner.id);}
   else expect(body.editions?.length).toBeGreaterThan(0);
   timings[kind].push(performance.now()-started);
  }
  async function readSignedOutExplore(){
   const started=performance.now();
   const response=await worker.fetch(new Request('https://distilled.test/api/explore/feeds?offset=0'),env,{} as ExecutionContext);
   expect(response.status).toBe(200);
   const page=await response.json() as {feeds:{id:string;publicFeedEnabled:boolean}[];nextOffset:number};
   expect(page.feeds).toHaveLength(100);
   expect(page.nextOffset).toBe(100);
   expect(page.feeds.every(f=>f.publicFeedEnabled && f.id!=='load-1')).toBe(true);
   timings.explore.push(performance.now()-started);
  }
  async function runBackgroundTick(){
   const count=await dispatchConnectorFeeds(env,Date.now(),20);
   const delivery=deliveries.shift();
   expect(delivery?.type).toBe('connector_feed');
   await processConnectorMessage(env,delivery!);
   return count;
  }
  async function checkActiveInputs(){
   for(let check=0;check<8;check++){
    const ids=await store.activeEvidenceRevisionIds(feed,['rev-1','rev-3999']);
    expect(ids.has('rev-1') && ids.has('rev-3999')).toBe(true);
   }
  }
  let dispatched=0;
  for(let wave=0;wave<8;wave++){
   const [count]=await Promise.all([runBackgroundTick(),
    checkActiveInputs(),read('session'),read('feed'),read('session'),read('feed'),readSignedOutExplore()]);
   dispatched+=count;
  }
  expect(dispatched).toBeGreaterThan(0);
  console.info('Local D1 concurrent reads', {legacyRows:legacy.meta.rows_read,boundedRows:bounded.rowsRead,dispatched,
   sessionP95Ms:p95(timings.session),feedP95Ms:p95(timings.feed),exploreP95Ms:p95(timings.explore)});
 }finally{await ctx.dispose();}
},120_000);

function p95(values:number[]):number{
 return Math.round(values.sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1]);
}
