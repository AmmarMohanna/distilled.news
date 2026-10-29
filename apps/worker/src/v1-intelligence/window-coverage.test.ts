import {it,expect} from 'vitest';import {DatabaseSync} from 'node:sqlite';
import {windowIntakeCoverage} from './window-coverage';import {jobsHoldingWindow} from './runtime';
it('retains blocked payment dependencies as incomplete coverage without holding healthy-source publication',async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
 sqlite.exec('CREATE TABLE v1_jobs(id TEXT,feed_source_id TEXT,json TEXT);CREATE TABLE v1_inputs(id TEXT,feed_source_id TEXT,json TEXT);CREATE TABLE v1_intake_scopes(id TEXT,feed_id TEXT,json TEXT)');
 sqlite.exec("CREATE INDEX connector_intake_feed ON v1_intake_scopes(feed_id,id);CREATE INDEX connector_intake_pending ON v1_jobs(feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'),id);CREATE INDEX inputs_lookup ON v1_inputs(id,feed_source_id)");
 sqlite.prepare('INSERT INTO v1_intake_scopes VALUES(?,?,?)').run('source','feed',JSON.stringify({enabled:true}));
 for(const [id,state,failureCode,failureDetail] of [['blocked','PENDING','BACKPRESSURE','ARTICLE_PROVIDER_RECONCILIATION_WAIT'],['budget','PENDING','BUDGET_EXHAUSTED','ARTICLE_PROVIDER_BUDGET'],['fresh','PENDING',null,null],['active','RUNNING',null,null],['own-unknown','FAILED','UNCERTAIN_PAID_SUBMISSION','ARTICLE_PROVIDER_OUTCOME_UNCERTAIN']]){
 sqlite.prepare('INSERT INTO v1_inputs VALUES(?,?,?)').run(id,'source',JSON.stringify({observation:{observedAt:'2026-10-27T11:00:00Z'}}));sqlite.prepare('INSERT INTO v1_jobs VALUES(?,?,?)').run(id,'source',JSON.stringify({kind:'ACQUIRE',state,observationId:id,failureCode,failureDetail}));}
 for(let n=0;n<1000;n++)sqlite.prepare('INSERT INTO v1_jobs VALUES(?,?,?)').run('old-'+n,'source',JSON.stringify({kind:'ACQUIRE',state:'DONE',observationId:'old-'+n}));
 let coverageQuery='';
 const db={prepare:(sql:string)=>{if(sql.includes('GROUP BY kind,state'))coverageQuery=sql;let args:any[]=[];const statement={bind:(...v:any[])=>{args=v;return statement},all:async()=>({results:sqlite.prepare(sql).all(...args)}),first:async()=>sqlite.prepare(sql).get(...args)??null};return statement}} as unknown as D1Database;
 expect(await jobsHoldingWindow(db,'feed','2026-10-27T12:00:00Z')).toBe(2);
 expect(await windowIntakeCoverage(db,'feed','2026-10-27T12:00:00Z')).toMatchObject({state:'PENDING',pendingJobs:2,blockedJobs:2,failedJobs:1});
 sqlite.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','DONE') WHERE id IN ('active','fresh')").run();
 expect(await jobsHoldingWindow(db,'feed','2026-10-27T12:00:00Z')).toBe(0);
 expect(await windowIntakeCoverage(db,'feed','2026-10-27T12:00:00Z')).toMatchObject({state:'INCOMPLETE',pendingJobs:0,blockedJobs:2,failedJobs:1});
 expect(JSON.parse(String(sqlite.prepare("SELECT json FROM v1_jobs WHERE id='blocked'").get()!.json)).state).toBe('PENDING');
 const plan=sqlite.prepare('EXPLAIN QUERY PLAN '+coverageQuery).all('feed','2026-10-27T12:00:00Z');
 expect(plan.some(row=>String(row.detail).includes('connector_intake_pending (feed_source_id=? AND <expr>=? AND <expr>=?)'))).toBe(true);
 }finally{sqlite.close()}
});
