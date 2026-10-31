import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {collectSnapshot,SQL} from '../apps/agentops-collector/src/snapshot.mjs';
const require=createRequire(new URL('../apps/worker/package.json',import.meta.url));
const {Miniflare}=require('miniflare');
test('real local D1 seeks indexed cohort on young and aged feeds and never returns evidence text',{timeout:60000},async()=>{
  const runtime=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']});
  try{
    const db=await runtime.getD1Database('DB');
    await db.exec(`CREATE TABLE v1_feeds(id TEXT PRIMARY KEY,json TEXT); CREATE TABLE v1_feed_documents(kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id)); CREATE TABLE v1_intake_scopes(id TEXT PRIMARY KEY,feed_id TEXT); CREATE TABLE v1_jobs(id TEXT PRIMARY KEY,feed_source_id TEXT,json TEXT); CREATE TABLE v1_model_spending_reservations(id TEXT PRIMARY KEY,feed_id TEXT,reserved_cost_usd REAL); CREATE TABLE v1_model_spending_settlements(id TEXT PRIMARY KEY,cost_usd REAL,reported INTEGER); CREATE INDEX connector_intake_feed ON v1_intake_scopes(feed_id,id); CREATE INDEX v1_jobs_due ON v1_jobs(feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'));`);
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
