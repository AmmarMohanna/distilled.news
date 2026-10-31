import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectSnapshot,SQL} from '../apps/agentops-collector/src/snapshot.mjs';
import worker,{collectAndExport} from '../apps/agentops-collector/src/index.mjs';
import {metricsPayload,sendMetrics} from '../apps/agentops-collector/src/otlp.mjs';
import {readFileSync} from 'node:fs';

const at=Date.parse('2026-10-31T10:00:00Z');
function database(overrides={}){
  const result={
    feed:[{schedule:{durationMinutes:30,clockStartAt:'2026-10-01T00:00:00Z'}}],
    request:[{id:'request',metadata:{id:'request',state:'DONE',result:'PUBLISHED',window:{start:'2026-10-31T09:00:00Z',end:'2026-10-31T09:25:00Z'}}}],
    run:[{timings:{stages:{edit:80,verify:20},totalMs:100}}],
    edition:[{scheduledFor:'2026-10-31T09:30:00Z',recordedPublishedAt:'2026-10-31T09:31:00Z'}],
    operations:[{id:'paid-1',moneyReserved:.1,cost:.02,reported:1,usage:{calls:1,costUsd:.02,reported:true,tokensIn:100,tokensOut:20},latencyMs:60},{id:'paid-2',moneyReserved:.1,reported:0,usage:{calls:1,costUsd:.1,reported:false},latencyMs:70}],
    sources:[{id:'private-source-canary'}],jobs:[{kind:'ACQUIRE',state:'PENDING',enqueuedAt:'2026-10-31T09:59:00Z'}],...overrides,
  };
  const calls=[];
  return {calls,prepare(sql){assert.match(sql,/^SELECT /);const key=Object.keys(SQL).find(k=>SQL[k]===sql);assert.ok(key);return {bind(...params){calls.push({key,params});return {async all(){return {success:true,results:result[key],meta:{rows_read:result[key].length,timings:{sql_duration_ms:.1}}};}};}};}};
}
test('Worker-native projection retains exact publication, unknown cost and active backlog semantics',async()=>{
  const db=database(),r=await collectSnapshot(db,'private-feed',at);
  assert.equal(r.values.publication_published,1);assert.equal(r.values.settled_cost_usd,undefined);
  assert.equal(r.values.confirmed_partial_cost_usd,.02);assert.equal(r.values.held_exposure_usd,.1);
  assert.equal(r.values.unknown_cost_operations,1);assert.equal(r.values.jobs_acquire_pending,1);
  assert.equal(r.values.jobs_reassess_pending,0);assert.equal(r.values.oldest_observed_pending_age_ms,60000);
  assert.equal(r.values.publication_duration_ms_p95,60000);assert.equal(r.values.v3_edit_duration_ms_p95,80);
  assert.equal(r.values.job_attempts,undefined);assert.equal(r.values.queue_wait_ms,undefined);
  assert.equal(r.work.queries,7);assert.equal(r.values.observer_up,1);
  const again=await collectSnapshot(db,'private-feed',at);assert.deepEqual(again.values,r.values);
  const text=JSON.stringify(metricsPayload(r.values,at));
  for(const canary of ['private-feed','private-source-canary','paid-1','api_key','prompt','headers'])assert.ok(!text.includes(canary),canary);
});
test('caps fail closed, missing source inventory is not zero backlog',async()=>{
  for(const [key,rows] of [['operations',25],['sources',5],['jobs',101]])await assert.rejects(()=>collectSnapshot(database({[key]:Array.from({length:rows},()=>({}))}),'feed',at),/COHORT_LIMIT/);
  await assert.rejects(()=>collectSnapshot(database({request:[]}),'feed',at),/NO_RECORDED_WINDOW/);
  const r=await collectSnapshot(database({sources:[],operations:[]}),'feed',at);
  assert.equal(r.values.jobs_acquire_pending,undefined);
});
test('read budgets stop collection and an observer failure exports no old application gauges',async()=>{
  const calls=[];const db={prepare(){return {bind(){return {all:async()=>({success:true,results:[],meta:{rows_read:2001}})};}};}};
  await assert.rejects(()=>collectSnapshot(db,'feed',at),/ROW_READ_BUDGET/);
  const fetcher=async(url,init)=>{calls.push(JSON.parse(init.body));return new Response('{}');};
  const r=await collectAndExport({DB:db,COLLECTOR_ENABLED:'true',COLLECTOR_FEED_ID:'feed',GRAFANA_OTLP_METRICS_URL:'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/metrics',GRAFANA_OTLP_AUTH:'secret'},{now:()=>at,fetcher});
  assert.equal(r.state,'OBSERVER_FAILED');const metrics=calls[0].resourceMetrics[0].scopeMetrics[0].metrics;
  assert.deepEqual(metrics.map(m=>m.name),['distilled_observer_up','distilled_projection_timestamp_seconds']);
  assert.equal(metrics[0].gauge.dataPoints[0].asDouble,0);
});
test('OTLP preserves names, job selector, gauge values and excludes arbitrary metrics/labels',()=>{
  const p=metricsPayload({observer_up:1,held_exposure_usd:0},at),m=p.resourceMetrics[0].scopeMetrics[0].metrics;
  assert.equal(m[1].name,'distilled_held_exposure_usd');assert.equal(m[1].unit,undefined);
  assert.equal(m[1].gauge.dataPoints[0].asDouble,0);
  assert.ok(m[0].gauge.dataPoints[0].attributes.some(a=>a.key==='job'&&a.value.stringValue==='distilled-snapshot'));
  assert.throws(()=>metricsPayload({prompt:1},at),/INVALID_METRIC/);
  assert.throws(()=>metricsPayload({observer_up:NaN},at),/INVALID_METRIC/);
  assert.throws(()=>metricsPayload({observer_up:1},at,'production'),/SCOPE/);
});
test('export has one attempt, rejects partial ingestion and never follows redirects',async()=>{
  const env={GRAFANA_OTLP_METRICS_URL:'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp/v1/metrics',GRAFANA_OTLP_AUTH:'private'};let n=0;
  await assert.rejects(()=>sendMetrics(env,{observer_up:1},at,async(_u,init)=>{n++;assert.equal(init.redirect,'error');throw Error('lost');}),/lost/);assert.equal(n,1);
  await assert.rejects(()=>sendMetrics(env,{observer_up:1},at,async()=>Response.json({partialSuccess:{rejectedDataPoints:1}})),/PARTIAL/);
  await assert.rejects(()=>sendMetrics({...env,GRAFANA_OTLP_METRICS_URL:'https://evil.example/otlp/v1/metrics'},{observer_up:1},at),/DESTINATION/);
});
test('collector has no public surface and disabled configuration performs no work',async()=>{
  assert.equal(worker.fetch().status,404);let n=0;
  assert.deepEqual(await collectAndExport({COLLECTOR_ENABLED:'false'},{fetcher:()=>{n++;}}),{state:'DISABLED'});assert.equal(n,0);
  const c=JSON.parse(readFileSync('apps/agentops-collector/wrangler.staging.jsonc','utf8'));
  assert.equal(c.workers_dev,false);assert.equal(c.observability.enabled,false);assert.equal(c.vars.COLLECTOR_ENABLED,'false');
  assert.deepEqual(c.triggers.crons,['*/15 * * * *']);assert.deepEqual(c.routes,[]);
  assert.equal(c.limits.cpu_ms,100);
  assert.equal(c.d1_databases.length,1);assert.equal(c.queues,undefined);
});
