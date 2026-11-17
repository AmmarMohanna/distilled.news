import {expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {windowHasHoldingJobs,windowIntakeCoverage} from './window-coverage';

it('window coverage excludes completed retained history and other feeds before loading input JSON',async()=>{
 const ctx=await createIntakeDatabase({product:true});
 try{
 const store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await store.registerScope({...scopeFixture,feedId:'other-feed',feedSourceId:'other-source'});
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<4000)
 INSERT INTO v1_jobs(id,feed_source_id,json)
 SELECT 'retained-'||n,'feed-source-1',json_object('kind',CASE WHEN n%3=0 THEN 'REASSESS' ELSE 'ACQUIRE' END,'state',CASE WHEN n%2=0 THEN 'DONE' ELSE 'DEFERRED' END) FROM history`).run();
 await ctx.db.prepare(`WITH RECURSIVE history(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM history WHERE n<2000)
 INSERT INTO v1_jobs(id,feed_source_id,json)
 SELECT 'foreign-'||n,'other-source',json_object('kind','ACQUIRE','state','PENDING') FROM history`).run();
 await ctx.db.prepare("INSERT INTO v1_jobs(id,feed_source_id,json) VALUES('current','feed-source-1',json_object('kind','REASSESS','state','PENDING'))").run();
 const reads:number[]=[],queries:{sql:string;args:unknown[]}[]=[];
 const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>{
  const all=async()=>{const result=await ctx.db.prepare(sql).bind(...args).all();reads.push(result.meta.rows_read);queries.push({sql,args});return result;};
  return {all,first:async()=>(await all()).results[0]??null};
 }})} as unknown as D1Database;
 expect(await windowIntakeCoverage(db,'feed-1','2026-10-03T13:00:00Z',{v3:true})).toMatchObject({state:'PENDING',pendingJobs:1,failedJobs:0});
 expect(await windowHasHoldingJobs(db,'feed-1','2026-10-03T13:00:00Z',{v3:true})).toBe(true);
 const plans=[];
 for(const query of queries){const plan=await ctx.db.prepare('EXPLAIN QUERY PLAN '+query.sql).bind(...query.args).all<{detail:string}>();plans.push(plan.results.map(r=>r.detail));}
 console.info(JSON.stringify({windowCoverageHistoryReads:reads,plans}));
 for(const rows of reads)expect(rows).toBeLessThan(30);
 }finally{await ctx.dispose()}
});
