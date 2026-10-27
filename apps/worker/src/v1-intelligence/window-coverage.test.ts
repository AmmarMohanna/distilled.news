import {it,expect} from 'vitest';import {DatabaseSync} from 'node:sqlite';
import {windowIntakeCoverage} from './window-coverage';import {jobsHoldingWindow} from './runtime';
it('retains blocked payment dependencies as incomplete coverage without holding healthy-source publication',async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
 sqlite.exec('CREATE TABLE v1_jobs(id TEXT,feed_source_id TEXT,json TEXT);CREATE TABLE v1_inputs(id TEXT,feed_source_id TEXT,json TEXT);CREATE TABLE v1_intake_scopes(id TEXT,feed_id TEXT,json TEXT)');
 sqlite.prepare('INSERT INTO v1_intake_scopes VALUES(?,?,?)').run('source','feed',JSON.stringify({enabled:true}));
 for(const [id,state,failureCode,failureDetail] of [['blocked','PENDING','BACKPRESSURE','ARTICLE_PROVIDER_RECONCILIATION_WAIT'],['active','RUNNING',null,null],['own-unknown','FAILED','UNCERTAIN_PAID_SUBMISSION','ARTICLE_PROVIDER_OUTCOME_UNCERTAIN']]){
 sqlite.prepare('INSERT INTO v1_inputs VALUES(?,?,?)').run(id,'source',JSON.stringify({observation:{observedAt:'2026-10-27T11:00:00Z'}}));sqlite.prepare('INSERT INTO v1_jobs VALUES(?,?,?)').run(id,'source',JSON.stringify({kind:'ACQUIRE',state,observationId:id,failureCode,failureDetail}));}
 const db={prepare:(sql:string)=>{let args:any[]=[];const statement={bind:(...v:any[])=>{args=v;return statement},all:async()=>({results:sqlite.prepare(sql).all(...args)}),first:async()=>sqlite.prepare(sql).get(...args)??null};return statement}} as unknown as D1Database;
 expect(await jobsHoldingWindow(db,'feed','2026-10-27T12:00:00Z')).toBe(1);
 expect(await windowIntakeCoverage(db,'feed','2026-10-27T12:00:00Z')).toMatchObject({state:'PENDING',pendingJobs:1,blockedJobs:1,failedJobs:1});
 sqlite.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','DONE') WHERE id='active'").run();
 expect(await jobsHoldingWindow(db,'feed','2026-10-27T12:00:00Z')).toBe(0);
 expect(await windowIntakeCoverage(db,'feed','2026-10-27T12:00:00Z')).toMatchObject({state:'INCOMPLETE',pendingJobs:0,blockedJobs:1,failedJobs:1});
 expect(JSON.parse(String(sqlite.prepare("SELECT json FROM v1_jobs WHERE id='blocked'").get()!.json)).state).toBe('PENDING');
 }finally{sqlite.close()}
});
