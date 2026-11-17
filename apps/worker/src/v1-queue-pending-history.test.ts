import {expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {pendingV1Jobs} from './v1-queue-dispatch';
import type {Env} from './types';

it('pending-job priority examines pending windows without reparsing retained completed requests for every job',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
 await seedIntakeScope(new V1IntakeStore(ctx.db));await new V1FeedStore(ctx.db).registerFeed(feedFixture);
 await ctx.db.prepare(`WITH RECURSIVE windows(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM windows WHERE n<2000)
 INSERT INTO v1_feed_documents(kind,id,feed_id,json)
 SELECT 'briefing_requests','done-'||n,'feed-1',json_object('state','DONE','window',json_object('start','2026-10-14T00:00:00Z','end','2026-10-14T01:00:00Z'),'retained',?) FROM windows`).bind('x'.repeat(1000)).run();
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','pending-window','feed-1',?)").bind(JSON.stringify({state:'PENDING',window:{start:'2026-10-14T00:00:00Z',end:'2026-10-14T01:00:00Z'}})).run();
 for(let n=0;n<40;n++){
  const id=String(n).padStart(2,'0');
  await ctx.db.batch([
   ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('observation-'+id,'feed-source-1',JSON.stringify({observation:{observedAt:'2026-10-15T11:00:00Z'}})),
   ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('job-'+id,'feed-source-1',JSON.stringify({kind:'REASSESS',state:'PENDING',observationId:'observation-'+id})),
  ]);
 }
 let reads=0;const plans:string[]=[];
 const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({all:async()=>{
  const result=await ctx.db.prepare(sql).bind(...args).all();reads=result.meta.rows_read;
  const plan=await ctx.db.prepare('EXPLAIN QUERY PLAN '+sql).bind(...args).all<{detail:string}>();plans.push(...plan.results.map(r=>r.detail));return result;
 }})})} as unknown as D1Database;
 const env={DB:db,SOURCE_QUEUE_SCHEDULING_ENABLED:'true'} as Env;
 expect(await pendingV1Jobs(env,'feed-source-1','REASSESS',new Date('2026-10-15T12:01:00Z'))).toEqual(['00','01','02','03','04'].map(id=>({id:'job-'+id})));
 console.info(JSON.stringify({pendingJobHistoryRows:reads,plans}));
 expect(reads).toBeLessThan(1000);
 }finally{await ctx.dispose()}
});
