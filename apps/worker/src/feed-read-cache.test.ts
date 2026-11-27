import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import * as sourceAvailability from './connector-availability';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {createApp,etagMatches} from './app';
import {D1Repository} from './repository';
import {createSession} from './auth';
import type {Env} from './types';
import {feedReadVersion,resetFeedReadCacheForTests} from './feed-read-cache';
import {profileD1,isWriteSql} from './perf/d1-profile';
import {seedQaShape,editionStatements,editionIdFor,feedId,feedSlug,OWNER,type QaShape} from './perf/qa-shape';
import {catchUpOpenExpiry,editionWindow,expireCatchUpOpens} from './reader-history';
import {recentProductEditions} from './product-feeds';

const SHAPE:QaShape={feeds:3,heavyJobs:60,jobsPerFeed:10,editionsHeavy:6,editionsPerFeed:3,citationsPerEdition:2,requestsPerFeed:3,pollsPerSource:3};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,ownerId:string;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});ownerId=(await seedQaShape(ctx.db,SHAPE)).owner.id;});
afterAll(async()=>{await ctx?.dispose();});
beforeEach(()=>resetFeedReadCacheForTests());

it('does not run owner-only source diagnostics for an anonymous cold reader',async()=>{
 const spy=vi.spyOn(sourceAvailability,'feedSourceAvailability').mockRejectedValue(new Error('D1_ERROR: diagnostics unavailable'));
 try{const response=await read(0,true);expect(response.status).toBe(200);expect((await response.json() as any).editions.length).toBeGreaterThan(0);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('preserves published data and explicitly reports unavailable source diagnostics to its owner',async()=>{
 const owner=await new D1Repository(ctx.db).getAccountById(ownerId),cookie=`dn_session=${await createSession('cache-secret',owner!)}`;
 const spy=vi.spyOn(sourceAvailability,'feedSourceAvailability').mockRejectedValue(new Error('D1_ERROR: diagnostics unavailable'));
 try{for(const cache of [true,false]){const response=await read(0,cache,{headers:{cookie}});expect(response.status).toBe(200);const body=await response.json() as any;expect(body.editions.length).toBeGreaterThan(0);expect(body.sourceHealthUnavailable).toBe(true);expect(body).not.toHaveProperty('sourceAvailability');}}finally{spy.mockRestore();}
});

const env=(db:D1Database,cache:boolean,extra:Partial<Env>={})=>({DB:db,ADMIN_SESSION_SECRET:'cache-secret',PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',
 BRIEFING_ENGINE:'v3',FEED_READ_CACHE_ENABLED:cache?'true':'false',...extra}) as unknown as Env;
const feedUrl=(f:number)=>`/api/feed/${OWNER}/${feedSlug(f)}`;
async function read(f:number,cache:boolean,init:RequestInit={},db:D1Database=ctx.db,extra:Partial<Env>={}){
 const app=createApp({repository:new D1Repository(db)});
 return app.request(feedUrl(f),init,env(db,cache,extra));
}

it('keeps the legacy timeline version stable across requests and changes it when an older edition is withdrawn',async()=>{
 const now=new Date('2026-11-26T12:00:00Z'),repo=new D1Repository(ctx.db),briefingId=feedId(1);
 const runtime=env(ctx.db,true,{PRODUCT_FEEDS_ENABLED:'false'});
 const app=createApp({now:()=>now}),url=`${feedUrl(1)}?timeline=1`;
 const records=Array.from({length:10},(_,i)=>{
  const at=new Date(now.getTime()-(i+1)*60_000).toISOString();
  const text='The coastal road reopened after an overnight security closure.';
  return {id:`legacy-${i}`,briefingId,cadence:'hourly' as const,windowStart:at,windowEnd:at,title:'Coastal news',summary:text,
    sections:[{title:'Infrastructure',summary:text,evidence:[]}],status:'published' as const,publishedAt:at,createdAt:at,updatedAt:at};
 });
 for(const edition of records)await repo.saveBriefingEdition(edition,now);
 const get=async(suffix='')=>{
  const response=await app.request(url+suffix,{},runtime);
  expect(response.status).toBe(200);
  return response.json() as Promise<{editions:{id:string}[];publicationVersion:string;timelineNextCursor:string|null}>;
 };
 try {
  const initial=await get(),pageQuery=`&before=${encodeURIComponent(initial.timelineNextCursor!)}`;
  expect(initial.editions).toHaveLength(8);
  expect(initial.publicationVersion).toMatch(/^\d+:\d+:(en|ar|fr)$/);
  await repo.recordCatchUpOpen(ownerId,records[0],catchUpOpenExpiry(records[0].publishedAt));
  const window={...editionWindow(now,1,2),excludeOpenedBy:ownerId};
  expect((await repo.listBriefingEditions(briefingId,true,now,2,window)).map(e=>e.id)).toEqual(['legacy-1','legacy-2']);
  expect(await repo.openedCatchUpCorrectionTargets(ownerId,briefingId,window,false)).toEqual([]);
  expect((await get()).publicationVersion).toBe(initial.publicationVersion);
  expect(await get(pageQuery)).toMatchObject({publicationVersion:initial.publicationVersion,editions:[{id:'legacy-8'},{id:'legacy-9'}]});
  await repo.saveBriefingEdition({...records[9],status:'empty'},now);
  const changed=await get();
  expect(changed.publicationVersion).not.toBe(initial.publicationVersion);
  expect(changed.editions).toEqual(initial.editions);
  expect(await get(pageQuery)).toMatchObject({publicationVersion:changed.publicationVersion,editions:[{id:'legacy-8'}]});
 } finally {
  await ctx.db.prepare("DELETE FROM catch_up_opened_editions WHERE feed_id=? AND edition_id LIKE 'legacy-%'").bind(briefingId).run();
  await ctx.db.prepare("DELETE FROM briefing_editions WHERE briefing_id=? AND id LIKE 'legacy-%'").bind(briefingId).run();
 }
});

it('excludes opened product editions before the limit and scopes correction targets to live publications',async()=>{
 const now=new Date('2026-11-26T12:00:00Z'),repo=new D1Repository(ctx.db),briefing=(await repo.getBriefingById(feedId(1)))!;
 const runtime=env(ctx.db,false,{CATCH_UP_ENABLED:'true',OPENROUTER_API_KEY:'offline-fixture'});
 const times=['2026-11-26T09:00:00.000Z','2026-11-26T10:00:00.000Z','2026-11-26T11:00:00.000Z'];
 const ids=times.map((_,i)=>editionIdFor(1,80+i));
 for(const [i,at] of times.entries())await ctx.db.batch(editionStatements(ctx.db,1,80+i,1,1,at));
 const [older,next,latest]=ids;
 const target=`${older}:original`,window=editionWindow(now,1,2),filtered={...window,excludeOpenedBy:ownerId};
 const readRecent=async(scope=window)=>(await recentProductEditions(runtime,briefing,scope)).map(e=>e.id);
 try {
  const owner=(await repo.getAccountById(ownerId))!;
  const cookie=`dn_session=${await createSession('cache-secret',owner)}`,app=createApp({now:()=>now});
  const requestOpen=(id:string)=>app.request(`${feedUrl(1)}/editions/${id}/opened`,{method:'POST',headers:{cookie}},runtime);
  const original=(await ctx.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='editions' AND id=?").bind(latest).first<{json:string}>())!;
  await ctx.db.batch([
   ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='editions' AND id=?").bind(latest),
   ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('editions',?,?,json_set(?,'$.stories[0].relation','correction','$.stories[0].updatesId',?))")
    .bind(latest,briefing.id,original.json,target)
  ]);
  expect(await readRecent(filtered)).toEqual([latest,next]);
  expect((await requestOpen(latest)).status).toBe(204);
  expect((await requestOpen(latest)).status).toBe(204);
  expect(await readRecent(filtered)).toEqual([next,older]);
  expect(await readRecent()).toEqual([latest,next]);
  expect(await repo.openedCatchUpCorrectionTargets(ownerId,briefing.id,window,true)).toEqual([target]);
  await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.publishedAt',?) WHERE kind='publication_status' AND id=?")
    .bind('2026-11-26T11:30:00.000Z',latest).run();
  expect(await readRecent(filtered)).toEqual([latest,next]);
  expect(await repo.openedCatchUpCorrectionTargets(ownerId,briefing.id,window,true)).toEqual([]);
  await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status' AND id=?").bind(latest).run();
  expect((await requestOpen(latest)).status).toBe(404);
  await expireCatchUpOpens(ctx.db,new Date('2027-02-01T00:00:00Z'));
  expect(await ctx.db.prepare('SELECT 1 FROM catch_up_opened_editions WHERE account_id=? AND feed_id=?').bind(ownerId,briefing.id).first()).toBeNull();
 } finally {
  await ctx.db.prepare('DELETE FROM catch_up_opened_editions WHERE account_id=? AND feed_id=?').bind(ownerId,briefing.id).run();
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE feed_id=? AND id IN (?,?,?) AND kind IN ('editions','publication_status')").bind(briefing.id,...ids).run();
 }
});

it('bounds D1 timeline reads while preserving permissions on older edition detail',async()=>{
 const app=createApp({now:()=>new Date('2026-11-26T12:00:00Z')});
 const path=feedUrl(1), runtime=env(ctx.db,true);
 const old=editionIdFor(1,0);
 const recent='2026-11-26T10:00:00.000Z';
 await ctx.db.batch(editionStatements(ctx.db,1,70,1,1,recent));
 try {
  const result=await app.request(`${path}?timeline=1`,{},runtime);
  expect(result.status).toBe(200);
  const timeline=await result.json() as {editions:{id:string}[];timelineNextCursor:string|null};
  expect(timeline.editions.map(edition=>edition.id)).toEqual([editionIdFor(1,70)]);
  expect(timeline.timelineNextCursor).toBeNull();
  expect((await app.request(`${path}/editions/${old}`,{},runtime)).status).toBe(200);
  const repo=new D1Repository(ctx.db),feed=(await repo.getBriefingById(feedId(1)))!;
  await repo.upsertBriefing({...feed,publicFeedEnabled:false});
  try {
   expect((await app.request(`${path}?timeline=1`,{},runtime)).status).toBe(404);
   expect((await app.request(`${path}/editions/${old}`,{},runtime)).status).toBe(404);
   expect((await app.request(`${path}/search?q=Article`,{},runtime)).status).toBe(404);
  } finally {await repo.upsertBriefing(feed);}
 } finally {
  await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE id=? AND kind IN ('editions','publication_status')").bind(editionIdFor(1,70)).run();
 }
});

it('bumps the read version only for edition and publication-status writes',async()=>{
 const id=feedId(2),before=await feedReadVersion(ctx.db,id);
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.attempts',1) WHERE kind='briefing_requests' AND id=?").bind(`${id}_req_0`).run();
 expect(await feedReadVersion(ctx.db,id)).toBe(before);
 await ctx.db.batch(editionStatements(ctx.db,2,40,1,1));
 expect(await feedReadVersion(ctx.db,id)).toBe(before+2);// edition + status
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status' AND id=?").bind(editionIdFor(2,40)).run();
 expect(await feedReadVersion(ctx.db,id)).toBe(before+3);
 await ctx.db.prepare("DELETE FROM v1_feed_documents WHERE kind='publication_status' AND id=?").bind(editionIdFor(2,40)).run();
 expect(await feedReadVersion(ctx.db,id)).toBe(before+4);
});

it('returns exactly the uncached payload',async()=>{
 for(const f of [0,1]){
  const uncached=await (await read(f,false)).json(),cached=await (await read(f,true)).json(),warm=await (await read(f,true)).json();
  expect(cached).toEqual(uncached);expect(warm).toEqual(uncached);
 }
});

it('serves a warm feed page from a version read instead of the edition and status queries',async()=>{
 const cold=profileD1(ctx.db);await (await read(0,true,{},cold.db)).arrayBuffer();
 const warm=profileD1(ctx.db);await (await read(0,true,{},warm.db)).arrayBuffer();
 const rows=(log:typeof warm.log)=>log.reduce((n,s)=>n+s.rowsRead,0);
 expect(warm.log.some(s=>/FROM v1_jobs/.test(s.sql))).toBe(false);
 expect(warm.log.some(s=>/kind='editions'/.test(s.sql))).toBe(false);
 expect(warm.log.length).toBeLessThan(cold.log.length);
 expect(rows(warm.log)).toBeLessThan(rows(cold.log)/4);
 expect([...cold.log,...warm.log].filter(s=>isWriteSql(s.sql))).toEqual([]);
});

it('shares one build between concurrent cold readers',async()=>{
 const profiler=profileD1(ctx.db);
 const responses=await Promise.all(Array.from({length:12},()=>read(1,true,{},profiler.db)));
 expect(responses.every(r=>r.status===200)).toBe(true);
 expect(profiler.log.filter(s=>/FROM v1_jobs/.test(s.sql)&&/'\$\.exhausted'/.test(s.sql)).length).toBe(1);
 expect(profiler.log.filter(s=>/ORDER BY json_extract\(e\.json,'\$\.createdAt'\) DESC/.test(s.sql)).length).toBe(1);
});

it('shows a new edition and hides a withdrawn one on the very next read',async()=>{
 const before=await (await read(1,true)).json() as {editions:{id:string}[]};
 const fresh=editionIdFor(1,90);
 await ctx.db.batch(editionStatements(ctx.db,1,90,1,2,'2027-01-01T00:00:00.000Z'));
 const published=await (await read(1,true)).json() as {editions:{id:string}[]};
 expect(published.editions[0].id).toBe(fresh);expect(published.editions.length).toBe(before.editions.length+1);
 const app=createApp({repository:new D1Repository(ctx.db)});
 expect((await app.request(`${feedUrl(1)}/editions/${fresh}`,{},env(ctx.db,true))).status).toBe(200);
 // The same status write withdrawV1Edition makes. The seeded edition has no ledger to project.
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN','$.withdrawnAt','2027-01-01T01:00:00.000Z','$.reason','OWNER_REQUEST') WHERE kind='publication_status' AND id=?").bind(fresh).run();
 const withdrawn=await (await read(1,true)).json() as {editions:{id:string}[]};
 expect(withdrawn.editions.map(e=>e.id)).not.toContain(fresh);
 expect((await app.request(`${feedUrl(1)}/editions/${fresh}`,{},env(ctx.db,true))).status).toBe(404);
 const search=await (await app.request(`${feedUrl(1)}/search?q=Supported`,{},env(ctx.db,true))).json() as {editions:{id:string}[]};
 expect(search.editions.map(e=>e.id)).not.toContain(fresh);
});

it('answers 304 for an unchanged feed and a new tag after a publish',async()=>{
 const first=await read(2,true),tag=first.headers.get('ETag');
 expect(tag).toMatch(/^W\/"/);
 const again=await read(2,true,{headers:{'If-None-Match':tag!}});
 expect(again.status).toBe(304);expect(again.headers.get('Cache-Control')).toBe('private, no-store');
 await ctx.db.batch(editionStatements(ctx.db,2,91,1,1,'2027-02-01T00:00:00.000Z'));
 const changed=await read(2,true,{headers:{'If-None-Match':tag!}});
 expect(changed.status).toBe(200);expect(changed.headers.get('ETag')).not.toBe(tag);
 expect(etagMatches(`"x", ${tag}`,tag!)).toBe(true);expect(etagMatches(undefined,tag!)).toBe(false);
});

it('never lets a warm cache bypass the private-feed access check',async()=>{
 const owner=await new D1Repository(ctx.db).getAccountById(ownerId);
 const cookie=`dn_session=${await createSession('cache-secret',owner!)}`;
 await ctx.db.prepare('UPDATE briefings SET public_feed_enabled=0 WHERE id=?').bind(feedId(1)).run();
 try{
  expect((await read(1,true,{headers:{cookie}})).status).toBe(200);
  expect((await read(1,true)).status).toBe(404);
  const app=createApp({repository:new D1Repository(ctx.db)});
  expect((await app.request(`${feedUrl(1)}/editions/${editionIdFor(1,0)}`,{},env(ctx.db,true))).status).toBe(404);
 }finally{await ctx.db.prepare('UPDATE briefings SET public_feed_enabled=1 WHERE id=?').bind(feedId(1)).run();}
});

it('refreshes collection status after its time-to-live without a publish',async()=>{
 const id=feedId(2),pending=`${id}_req_${SHAPE.requestsPerFeed-1}`;
 const status=async()=>((await (await read(2,true,{},ctx.db,{FEED_STATUS_CACHE_SECONDS:'0'})).json()) as {publicationState:string}).publicationState;
 const before=await status();
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.state','FAILED') WHERE kind='briefing_requests' AND id=?").bind(pending).run();
 try{expect(await status()).toBe('failed');expect(before).not.toBe('failed');}
 finally{await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.state','PENDING') WHERE kind='briefing_requests' AND id=?").bind(pending).run();}
});

it('reads only this feed\'s acquisition jobs for source availability',async()=>{
 const {feedSourceAvailability}=await import('./connector-availability');
 const profiler=profileD1(ctx.db);
 await feedSourceAvailability(env(profiler.db,false),feedId(1));
 const jobs=profiler.log.find(s=>/FROM v1_jobs/.test(s.sql))!;
 // Feed 0 alone holds SHAPE.heavyJobs acquisitions. The old join scanned all of them.
 expect(jobs.rowsRead).toBeLessThan(SHAPE.heavyJobs);
});

it('sends source collection diagnostics only to the feed owner and admins',async()=>{
 const repo=new D1Repository(ctx.db);
 const owner=await repo.getAccountById(ownerId);
 const admin=await repo.createAccount({email:'diag-admin@example.invalid',username:'diagadmin',passwordHash:'hash',role:'admin'});
 const reader=await repo.createAccount({email:'diag-reader@example.invalid',username:'diagreader',passwordHash:'hash',role:'user'});
 const cookie=async(account:typeof owner)=>({headers:{cookie:`dn_session=${await createSession('cache-secret',account!)}`}});
 for(const cache of [false,true]){
  const body=async(init:RequestInit={})=>(await (await read(0,cache,init)).json()) as Record<string,unknown>;
  expect(await body()).not.toHaveProperty('sourceAvailability');
  expect(await body(await cookie(reader))).not.toHaveProperty('sourceAvailability');
  expect(Array.isArray((await body(await cookie(owner))).sourceAvailability)).toBe(true);
  expect(Array.isArray((await body(await cookie(admin))).sourceAvailability)).toBe(true);
 }
 await ctx.db.prepare('UPDATE accounts SET disabled_at=? WHERE id=?').bind('2027-01-01T00:00:00.000Z',admin.id).run();
 expect(await (await read(0,true,await cookie(admin))).json()).not.toHaveProperty('sourceAvailability');
 // A reader's cached tag never validates the owner's diagnostic response.
 const readerTag=(await read(0,true)).headers.get('ETag');
 expect((await read(0,true,{headers:{...(await cookie(owner)).headers,'If-None-Match':readerTag!}})).status).toBe(200);
});

it('adds stale-source warnings for the owner and keeps them out of reader responses',async()=>{
 const owner=await new D1Repository(ctx.db).getAccountById(ownerId);
 const cookie={headers:{cookie:`dn_session=${await createSession('cache-secret',owner!)}`}};
 const first=(await (await read(0,true,cookie)).json()) as {sourceAvailability:{sourceId:string}[]};
 const sourceId=first.sourceAvailability[0].sourceId;
 const runs=Array.from({length:3},(_,i)=>ctx.db.prepare('INSERT INTO connector_fetch_runs(feed_id,feed_source_id,run_id,source_id,sequence,started_at,configuration_key) VALUES(?,?,?,?,?,?,?)')
  .bind(feedId(0),sourceId,`stale-run-${i}`,sourceId,900000+i,`2026-01-0${i+1}T00:00:00.000Z`,'k'));
 await ctx.db.batch(runs);
 try{
  for(const cache of [false,true]){
   const owned=(await (await read(0,cache,cookie)).json()) as {sourceAvailability:{sourceId:string;collectionAlerts?:string[]}[]};
   expect(owned.sourceAvailability.find(s=>s.sourceId===sourceId)?.collectionAlerts).toContain('SOURCE_NO_RECENT_SUCCESS');
   expect(await (await read(0,cache)).json()).not.toHaveProperty('sourceAvailability');
  }
 }finally{await ctx.db.prepare("DELETE FROM connector_fetch_runs WHERE run_id LIKE 'stale-run-%'").run();}
});
