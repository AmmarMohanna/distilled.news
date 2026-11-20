import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {collectSnapshot,SQL} from '../apps/agentops-collector/src/snapshot.mjs';
import {collectDeploymentSnapshot} from '../apps/agentops-collector/src/deployment.mjs';
const require=createRequire(new URL('../apps/worker/package.json',import.meta.url));
const {Miniflare}=require('miniflare');
// The connector tables and indexes the snapshot reads, as in 0044_connector_runtime.sql and 0035.
const CONNECTOR_TABLES="CREATE TABLE connector_fetch_runs(feed_id TEXT NOT NULL,feed_source_id TEXT NOT NULL,run_id TEXT NOT NULL,sequence INTEGER NOT NULL,started_at TEXT NOT NULL,PRIMARY KEY(feed_id,feed_source_id,run_id),UNIQUE(feed_id,feed_source_id,sequence)); CREATE TABLE connector_provider_batches(feed_id TEXT NOT NULL,feed_source_id TEXT NOT NULL,batch_key TEXT NOT NULL,data TEXT NOT NULL,receipts TEXT,PRIMARY KEY(feed_id,feed_source_id,batch_key)); CREATE TABLE connector_batches(feed_id TEXT NOT NULL,feed_source_id TEXT NOT NULL,handoff_id TEXT NOT NULL,data TEXT NOT NULL,receipts TEXT,PRIMARY KEY(feed_id,feed_source_id,handoff_id)); CREATE TABLE v1_inputs(id TEXT PRIMARY KEY,feed_source_id TEXT,json TEXT); CREATE INDEX v1_inputs_scope ON v1_inputs(feed_source_id);";
test('real local D1 seeks indexed cohort on young and aged feeds and never returns evidence text',{timeout:60000},async()=>{
  const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});
  try{
    const db=await runtime.getD1Database('DB');
    await db.exec(`CREATE TABLE v1_feeds(id TEXT PRIMARY KEY,json TEXT); CREATE TABLE v1_feed_documents(kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id)); CREATE TABLE v1_intake_scopes(id TEXT PRIMARY KEY,feed_id TEXT); CREATE TABLE v1_jobs(id TEXT PRIMARY KEY,feed_source_id TEXT,json TEXT); CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,feed_id TEXT,reserved_cost_usd REAL); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER); CREATE INDEX connector_intake_feed ON v1_intake_scopes(feed_id,id); CREATE INDEX v1_jobs_due ON v1_jobs(feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'));`);
    await db.exec(CONNECTOR_TABLES);await db.exec(readFileSync('apps/worker/migrations/0100_source_collection_history_index.sql','utf8').replace(/--.*\n/g,'').replace(/\s+/g,' '));
    for(const file of ['0075_legacy_window_identity_lookup.sql','0081_clock_aligned_delivery.sql']){
      const sql=readFileSync('apps/worker/migrations/'+file,'utf8');
      const match=sql.match(/CREATE INDEX(?: IF NOT EXISTS)? v1_(?:semantic_intent_budget|clock_schedule_requests)[\s\S]*?;/);
      assert.ok(match);await db.prepare(match[0]).run();
    }
    const schedule={durationMinutes:30,clockStartAt:'2026-10-01T00:00:00Z'};
    await db.prepare('INSERT INTO v1_feeds VALUES(?,?)').bind('pilot',JSON.stringify({briefingSchedule:schedule})).run();
    const request={id:'r',state:'DONE',result:'PUBLISHED',window:{...schedule,start:'2026-10-31T09:00:00Z',end:'2026-10-31T09:25:00Z'},body:'PRIVATE_CONTENT_CANARY'};
    await db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','r','pilot',JSON.stringify(request)).run();
    await db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('editions','r','pilot',JSON.stringify({scheduledFor:'2026-10-31T09:30:00Z',publishedAt:'2026-10-31T09:31:00Z',stories:['PRIVATE_CONTENT_CANARY']})).run();
    const before=await collectSnapshot(db,'pilot',Date.parse('2026-10-31T10:00:00Z'));
    for(let batch=0;batch<10;batch++)await db.batch(Array.from({length:100},(_,i)=>db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','old-'+batch+'-'+i,'pilot',JSON.stringify({...request,window:{...request.window,end:'2026-10-01T00:25:00Z'}}))));
    const after=await collectSnapshot(db,'pilot',Date.parse('2026-10-31T10:00:00Z'));
    assert.deepEqual(after.values,before.values);assert.ok(after.work.rowsRead<=before.work.rowsRead+20);
    const plan=await db.prepare('EXPLAIN QUERY PLAN '+SQL.request).bind('pilot',schedule.clockStartAt,30).all();
    const details=plan.results.map(r=>r.detail).join('\n');assert.match(details,/v1_clock_schedule_requests/);assert.doesNotMatch(details,/TEMP B-TREE/);
    assert.equal(after.values.publication_duration_ms_p95,60000);assert.ok(!JSON.stringify(after).includes('PRIVATE_CONTENT_CANARY'));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM v1_feed_documents').first()).n,1002);
  }finally{await runtime.dispose();}
});
test('deployment aggregates include all feeds, exclude future deliveries and use unresolved history only',{timeout:30000},async()=>{
 const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});try{
  const db=await runtime.getD1Database('DB');await db.exec('CREATE TABLE v1_feed_documents(kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id)); CREATE TABLE v1_model_active_operations(id TEXT,lease_until INTEGER);');
  await db.prepare(readFileSync('apps/worker/migrations/0074_unresolved_publication_windows.sql','utf8')).run();
  const now=Date.parse('2026-11-11T12:00:00Z');
  for(const [id,feed,state,scheduledFor] of [['late-a','a','PENDING','2026-11-11T11:00:00Z'],['late-b','b','PENDING','2026-11-11T11:30:00Z'],['future','c','PENDING','2026-11-11T12:30:00Z'],['failed','d','FAILED','2026-11-11T10:00:00Z'],['done','a','DONE','2026-11-11T10:00:00Z']])await db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests',id,feed,JSON.stringify({state,window:{scheduledFor},result:state==='DONE'?'PUBLISHED':undefined})).run();
  await db.prepare('INSERT INTO v1_model_active_operations VALUES(?,?),(?,?)').bind('live',now+1000,'expired',now-1000).run();
  const r=await collectDeploymentSnapshot(db,now);assert.equal(r.values.deployment_pending_briefings,2);assert.equal(Math.round(r.values.deployment_oldest_pending_age_seconds),3600);assert.equal(r.values.deployment_failed_briefings,1);assert.equal(r.values.deployment_expired_model_leases,1);assert.equal(r.work.queries,2);assert.ok(r.work.rowsRead<20);
 }finally{await runtime.dispose()}
});

test('source collection alerts come from indexed point reads, however long the history',{timeout:60000},async()=>{
  const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});
  try{
    const db=await runtime.getD1Database('DB');
    await db.exec(`CREATE TABLE v1_feeds(id TEXT PRIMARY KEY,json TEXT); CREATE TABLE v1_feed_documents(kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id)); CREATE TABLE v1_intake_scopes(id TEXT PRIMARY KEY,feed_id TEXT); CREATE TABLE v1_jobs(id TEXT PRIMARY KEY,feed_source_id TEXT,json TEXT); CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,feed_id TEXT,reserved_cost_usd REAL); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER); CREATE INDEX connector_intake_feed ON v1_intake_scopes(feed_id,id); CREATE INDEX v1_jobs_due ON v1_jobs(feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'));`);
    await db.exec(CONNECTOR_TABLES);await db.exec(readFileSync('apps/worker/migrations/0100_source_collection_history_index.sql','utf8').replace(/--.*\n/g,'').replace(/\s+/g,' '));
    for(const file of ['0075_legacy_window_identity_lookup.sql','0081_clock_aligned_delivery.sql']){
      const match=readFileSync('apps/worker/migrations/'+file,'utf8').match(/CREATE INDEX(?: IF NOT EXISTS)? v1_(?:semantic_intent_budget|clock_schedule_requests)[\s\S]*?;/);
      assert.ok(match);await db.prepare(match[0]).run();
    }
    const window={durationMinutes:30,clockStartAt:'2026-10-01T00:00:00Z',start:'2026-11-18T09:00:00Z',end:'2026-11-18T09:30:00Z'};
    await db.prepare('INSERT INTO v1_feeds VALUES(?,?)').bind('pilot',JSON.stringify({briefingSchedule:{durationMinutes:30,clockStartAt:window.clockStartAt}})).run();
    await db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('briefing_requests','r','pilot',JSON.stringify({id:'r',state:'DONE',result:'PUBLISHED',window})).run();
    // stale: accepted long ago, still checked. never: checked, never produced an input. healthy: accepted recently.
    for(const id of ['healthy','never','stale'])await db.prepare('INSERT INTO v1_intake_scopes VALUES(?,?)').bind(id,'pilot').run();
    const hour=3600000,now=Date.parse('2026-11-18T10:00:00Z');
    for(const id of ['healthy','never','stale'])await db.batch(Array.from({length:300},(_,i)=>db.prepare('INSERT INTO connector_fetch_runs VALUES(?,?,?,?,?)').bind('pilot',id,id+i,i+1,new Date(now-(300-i)*hour).toISOString())));
    const batch=(id,i,accepted)=>db.prepare('INSERT INTO connector_provider_batches VALUES(?,?,?,?,?)').bind('pilot',id,id+i,JSON.stringify({request:{coverage:{createdAt:new Date(now-(300-i)*hour).toISOString()},observations:[]}}),accepted?'{}':null);
    await db.batch(Array.from({length:300},(_,i)=>batch('healthy',i,true)));
    await db.batch(Array.from({length:300},(_,i)=>batch('stale',i,i<200)));
    await db.batch(Array.from({length:300},(_,i)=>batch('never',i,true)));
    for(const id of ['healthy','stale'])await db.prepare('INSERT INTO v1_inputs VALUES(?,?,?)').bind(id+'-input',id,'{}').run();
    const snapshot=await collectSnapshot(db,'pilot',now);
    assert.equal(snapshot.values.source_no_recent_success,1);
    assert.equal(snapshot.values.source_never_collected,1);
    assert.ok(snapshot.work.rowsRead<200,`rows read ${snapshot.work.rowsRead}`);
    const plan=(await db.prepare('EXPLAIN QUERY PLAN '+SQL.sources).bind('pilot').all()).results.map(r=>r.detail).join('\n');
    assert.match(plan,/connector_provider_batches_accepted/);assert.match(plan,/connector_batches_accepted/);
  }finally{await runtime.dispose();}
});
