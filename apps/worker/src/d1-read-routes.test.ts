import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {createApp} from './app';
import {D1Repository} from './repository';
import {createSession} from './auth';
import type {Env} from './types';
import {isIdempotentReadSql,isReadOnlyRoute,readRouteDatabase,readSessionConstraint,withReadRetry} from './d1-read-routes';
import {profileD1,isWriteSql} from './perf/d1-profile';
import {seedQaShape,editionIdFor,feedId,feedSlug,OWNER,type QaShape} from './perf/qa-shape';

const OVERLOADED='D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.';

it('recognizes only GET reads of the public feed, explore and trace routes',()=>{
 for(const path of ['/api/feed/a/b','/api/feed/a/b/editions/e1','/api/feed/a/b/search','/api/feed/a/b/developments','/api/feed/a/b/sketch','/api/feed/a/b/items/i/evidence','/api/explore/feeds','/api/admin/briefings/f/pipeline-trace'])
  expect(isReadOnlyRoute('GET',path),path).toBe(true);
 expect(isReadOnlyRoute('POST','/api/feed/a/b/star')).toBe(false);
 expect(isReadOnlyRoute('GET','/api/feed/a/b/star')).toBe(false);
 expect(isReadOnlyRoute('POST','/api/feed/a/b')).toBe(false);
 expect(isReadOnlyRoute('GET','/api/me/briefings')).toBe(false);
 expect(isReadOnlyRoute('GET','/api/admin/briefings/f')).toBe(false);
});

it('sends signed-in readers to the primary first and anonymous readers to any replica',()=>{
 expect(readSessionConstraint(new Request('https://x/api/feed/a/b',{headers:{cookie:'dn_voter=1; dn_session=abc'}}))).toBe('first-primary');
 expect(readSessionConstraint(new Request('https://x/api/feed/a/b',{headers:{cookie:'dn_voter=1'}}))).toBe('first-unconstrained');
});

it('opens a session only for read routes and only behind the flag',()=>{
 const session={prepare:vi.fn()},withSession=vi.fn(()=>session);
 const DB={prepare:vi.fn(),batch:vi.fn(),withSession} as unknown as D1Database;
 readRouteDatabase({DB} as Env,new Request('https://x/api/feed/a/b'));
 expect(withSession).not.toHaveBeenCalled();
 readRouteDatabase({DB,D1_READ_SESSIONS_ENABLED:'true'} as Env,new Request('https://x/api/feed/a/b/star',{method:'POST'}));
 expect(withSession).not.toHaveBeenCalled();
 readRouteDatabase({DB,D1_READ_SESSIONS_ENABLED:'true'} as Env,new Request('https://x/api/feed/a/b'));
 expect(withSession).toHaveBeenCalledWith('first-unconstrained');
});

it('classifies only plain reads as retryable',()=>{
 expect(isIdempotentReadSql('SELECT 1')).toBe(true);
 expect(isIdempotentReadSql(' WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
 expect(isIdempotentReadSql('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toBe(false);
 expect(isIdempotentReadSql('UPDATE t SET a=1 RETURNING a')).toBe(false);
 expect(isIdempotentReadSql('SELECT * FROM t; DELETE FROM t')).toBe(false);
});

function flakyDatabase(){
 const calls:string[]=[];let failNext=true;
 const statement=(sql:string):D1PreparedStatement=>({
  bind:()=>statement(sql),
  all:async()=>{calls.push(sql);if(failNext){failNext=false;throw new Error(OVERLOADED);}return {results:[{ok:1}]};},
  first:async()=>{calls.push(sql);if(failNext){failNext=false;throw new Error(OVERLOADED);}return {ok:1};},
  run:async()=>{calls.push(sql);if(failNext){failNext=false;throw new Error(OVERLOADED);}return {success:true};},
 }) as unknown as D1PreparedStatement;
 const db={prepare:(sql:string)=>statement(sql),batch:async(list:D1PreparedStatement[])=>{calls.push(`batch:${list.length}`);if(failNext){failNext=false;throw new Error(OVERLOADED);}return [];}} as unknown as D1Database;
 return {native:db,db:withReadRetry(db),calls,arm:()=>{failNext=true;}};
}

it('retries session overload on the primary even when replica sessions are enabled',async()=>{
 const {native,calls}=flakyDatabase();
 const withSession=vi.fn(()=>{throw Error('session validation must stay on primary')});
 const DB:D1Database=Object.assign(native,{withSession});
 const db=readRouteDatabase({DB,D1_READ_SESSIONS_ENABLED:'true'} as Env,new Request('https://x/api/auth/session'));
 expect(await db.prepare('SELECT 1').first()).toEqual({ok:1});
 expect(calls).toEqual(['SELECT 1','SELECT 1']);
 expect(withSession).not.toHaveBeenCalled();
});

it('retries an overloaded read once and never retries a write',async()=>{
 const flaky=flakyDatabase();
 await expect(flaky.db.prepare('SELECT ?').bind(1).first()).resolves.toEqual({ok:1});
 expect(flaky.calls).toEqual(['SELECT ?','SELECT ?']);
 flaky.arm();flaky.calls.length=0;
 await expect(flaky.db.prepare('INSERT INTO t VALUES(?)').bind(1).run()).rejects.toThrow(/overloaded/);
 expect(flaky.calls).toEqual(['INSERT INTO t VALUES(?)']);
 flaky.arm();flaky.calls.length=0;
 await expect(flaky.db.batch([flaky.db.prepare('SELECT 1'),flaky.db.prepare('UPDATE t SET a=1')])).rejects.toThrow(/overloaded/);
 expect(flaky.calls).toEqual(['batch:2']);
 flaky.arm();flaky.calls.length=0;
 await expect(flaky.db.batch([flaky.db.prepare('SELECT 1'),flaky.db.prepare('SELECT 2')])).resolves.toEqual([]);
 expect(flaky.calls).toEqual(['batch:2','batch:2']);
});

it('does not retry errors that are not overloads',async()=>{
 const calls:string[]=[];
 const db=withReadRetry({prepare:(sql:string)=>({bind(){return this},first:async()=>{calls.push(sql);throw new Error('D1_ERROR: no such table: x');}})} as unknown as D1Database);
 await expect(db.prepare('SELECT * FROM x').first()).rejects.toThrow(/no such table/);
 expect(calls.length).toBe(1);
});

describe('on a QA-shaped database',()=>{
 const SHAPE:QaShape={feeds:2,heavyJobs:20,jobsPerFeed:5,editionsHeavy:3,editionsPerFeed:2,citationsPerEdition:2,requestsPerFeed:2,pollsPerSource:2};
 let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
 beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await seedQaShape(ctx.db,SHAPE);});
 afterAll(async()=>{await ctx?.dispose();});

 it('serves every read-only route through a session without writing',async()=>{
  const repo=new D1Repository(ctx.db);
  const admin=await repo.createAccount({email:'read-admin@example.invalid',username:'read-admin',role:'admin',passwordHash:'unused',emailVerifiedAt:new Date().toISOString()});
  const cookie=`dn_session=${await createSession('read-secret',admin)}`;
  const feed=`/api/feed/${OWNER}/${feedSlug(0)}`;
  const paths=[feed,`${feed}/editions/${editionIdFor(0,1)}`,`${feed}/search?q=Supported`,'/api/explore/feeds',`/api/admin/briefings/${feedId(0)}/pipeline-trace`];
  for(const cache of ['false','true']){
   const profiler=profileD1(ctx.db);
   for(const path of paths){
    const request=new Request(`https://distilled.test${path}`,{headers:path.includes('/admin/')?{cookie}:{}});
    expect(isReadOnlyRoute('GET',new URL(request.url).pathname),path).toBe(true);
    const env={DB:profiler.db,ADMIN_SESSION_SECRET:'read-secret',PRODUCT_FEEDS_ENABLED:'true',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',BRIEFING_ENGINE:'v3',
     D1_READ_SESSIONS_ENABLED:'true',FEED_READ_CACHE_ENABLED:cache} as unknown as Env;
    const routed={...env,DB:readRouteDatabase(env,request)};
    const response=await createApp({repository:new D1Repository(routed.DB)}).fetch(request,routed);
    expect(response.status,path).toBe(200);await response.arrayBuffer();
   }
   expect(profiler.log.length).toBeGreaterThan(0);
   expect(profiler.log.filter(s=>isWriteSql(s.sql)||s.rowsWritten>0).map(s=>s.sql.slice(0,80))).toEqual([]);
  }
 });
});

it('works against a real D1 session binding',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
  const env={DB:ctx.db,D1_READ_SESSIONS_ENABLED:'true'} as unknown as Env;
  const db=readRouteDatabase(env,new Request('https://x/api/explore/feeds'));
  expect(await db.prepare('SELECT 1 AS one').first()).toEqual({one:1});
  expect((await db.batch([db.prepare('SELECT 2 AS two')]))[0].results).toEqual([{two:2}]);
 }finally{await ctx.dispose();}
});
