import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {createApp,etagMatches} from './app';
import {D1Repository} from './repository';
import {createSession} from './auth';
import type {Env} from './types';
import {feedReadVersion,resetFeedReadCacheForTests} from './feed-read-cache';
import {profileD1,isWriteSql} from './perf/d1-profile';
import {seedQaShape,editionStatements,editionIdFor,feedId,feedSlug,OWNER,type QaShape} from './perf/qa-shape';

const SHAPE:QaShape={feeds:3,heavyJobs:60,jobsPerFeed:10,editionsHeavy:6,editionsPerFeed:3,citationsPerEdition:2,requestsPerFeed:3,pollsPerSource:3};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,ownerId:string;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});ownerId=(await seedQaShape(ctx.db,SHAPE)).owner.id;});
afterAll(async()=>{await ctx?.dispose();});
beforeEach(()=>resetFeedReadCacheForTests());

const env=(db:D1Database,cache:boolean,extra:Partial<Env>={})=>({DB:db,ADMIN_SESSION_SECRET:'cache-secret',PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',
 BRIEFING_ENGINE:'v3',FEED_READ_CACHE_ENABLED:cache?'true':'false',...extra}) as unknown as Env;
const feedUrl=(f:number)=>`/api/feed/${OWNER}/${feedSlug(f)}`;
async function read(f:number,cache:boolean,init:RequestInit={},db:D1Database=ctx.db,extra:Partial<Env>={}){
 const app=createApp({repository:new D1Repository(db)});
 return app.request(feedUrl(f),init,env(db,cache,extra));
}

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
