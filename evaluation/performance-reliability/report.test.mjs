import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseEvidenceJsonl,importEvidence} from './import-evidence.mjs';
import {buildReport,reportFromBundle,reportToCsv,ANALYSIS_VERSION} from './report.mjs';

const fixtureUrl=new URL('./fixtures/offline-contract.jsonl',import.meta.url);
const text=fs.readFileSync(fixtureUrl,'utf8');
const catalogText=fs.readFileSync(new URL('./metric-catalog.json',import.meta.url),'utf8');
const catalog=JSON.parse(catalogText);
const sha=s=>createHash('sha256').update(s).digest('hex');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const build=records=>buildReport(importEvidence(records),{bundleSha256:'0'.repeat(64),catalog,catalogSha256:'1'.repeat(64)});
const slice=(report,dimension,value,campaign=0)=>report.campaigns[campaign].slices.find(s=>s.dimension===dimension&&s.value===value).metrics;
const metric=(metrics,id,forMetric)=>metrics.find(m=>m.metricId===id&&(forMetric===undefined||m.forMetric===forMetric));
const ratio=m=>[m.numerator,m.denominator];

test('hand-computed fixture reproduces the campaign-wide report exactly',()=>{
  const r=reportFromBundle(text,{catalogText}),all=slice(r,'all','all');
  assert.equal(r.reproduction.bundleSha256,sha(text));assert.equal(r.analysisVersion,ANALYSIS_VERSION);
  assert.deepEqual(r.import,{inputRecords:30,uniqueRecords:29,duplicateRecords:1,contradictions:[]});
  const success=metric(all,'operational_window_success');
  // Due by 03:20: o1..o6. Successes: o1, o2 read back; o3 quiet. o7 (window ends 04:00) is offered but not yet due.
  assert.deepEqual(ratio(success),[3,6]);assert.equal(success.offeredNotYetDue,1);
  assert.deepEqual(success.outcomeCounts,{PUBLISHED_READBACK:2,QUIET:1,SAFE_REJECTED:0,FAILED:1,PERSISTED_UNCONFIRMED:1,PENDING:1,UNKNOWN:0,NOT_ADMITTED:0});
  assert.deepEqual(ratio(metric(all,'window_resolution')),[4,6]);
  // 30-minute deadline: mature o1 (met), o2 (late), o3 (met), o4 (failed); o5, o6 immature at 03:20.
  const deadline=metric(all,'window_success_by_deadline');
  assert.deepEqual(ratio(deadline),[2,4]);assert.deepEqual([deadline.due,deadline.mature,deadline.immature,deadline.future],[6,4,2,1]);
  assert.deepEqual([deadline.dueCohortBounds.lower,deadline.dueCohortBounds.upper],[2/6,4/6]);
  assert.deepEqual(ratio(metric(all,'public_readback_coverage')),[2,3]);
  const readback=metric(all,'cutoff_to_public_readback');
  assert.deepEqual([readback.n,readback.p50,readback.p95,readback.min,readback.max],[2,1500000,2310000,600000,2400000]);
  assert.equal(readback.clockBasis,'SYNTHETIC_FIXTURE->SYNTHETIC_FIXTURE');assert.equal(readback.proxy,false);
  assert.deepEqual(ratio(metric(all,'observability_coverage','cutoff_to_public_readback')),[2,2]);
  const push=metric(all,'notification_service_acceptance');
  assert.deepEqual(ratio(push),[2,3]);assert.equal(push.unitsNotObservedForFullHorizon,1);assert.equal(push.deviceReceipt,'unavailable');
  const pushLatency=metric(all,'publication_to_push_service_acceptance');
  assert.deepEqual([pushLatency.n,pushLatency.p50,pushLatency.p95],[2,75000,88500]);
  const acquisition=metric(all,'acquisition_acceptance');
  assert.deepEqual(ratio(acquisition),[2,4]);assert.equal(acquisition.attempts,4);
  const elapsed=metric(all,'acquisition_attempt_elapsed');
  assert.deepEqual([elapsed.n,elapsed.p50,elapsed.p95],[3,2000,4700]);
  const coverage=metric(all,'observability_coverage','acquisition_attempt_elapsed');
  assert.deepEqual(ratio(coverage),[3,4]);assert.deepEqual(coverage.unavailableByReason,{BOUNDARY_NOT_OBSERVED:1});
  const cost=metric(all,'attributed_provider_cost');
  assert.equal(cost.operations,4);close(cost.knownReportedCostUsd,.35);close(cost.ledgerSettledCostUsd,.15);
  assert.equal(cost.unknownCostOperations,1);assert.equal(cost.fullyReportedCostUsd,null);
  close(cost.totalReservedCeilingsUsd,.8);close(cost.unsettledRecordedExposureUsd,.5);
  assert.deepEqual(ratio(metric(all,'settlement_coverage')),[2,4]);
  const perPublication=metric(all,'provider_cost_per_verified_publication');
  assert.equal(perPublication.value,null);assert.equal(perPublication.unavailableReason,'UNKNOWN_COST_OPERATIONS');
  const effort=metric(all,'operator_active_effort');
  assert.deepEqual([effort.interventions,effort.measuredActiveMinutes,effort.activeMinutes],[2,4,null]);
});
test('slices recompute from their own records and keep unknowns unavailable',()=>{
  const r=reportFromBundle(text,{catalogText});
  const en=slice(r,'language','en'),ar=slice(r,'language','ar');
  assert.deepEqual(ratio(metric(en,'operational_window_success')),[2,3]);
  assert.deepEqual(ratio(metric(ar,'operational_window_success')),[1,3]);
  assert.deepEqual(ratio(metric(en,'window_success_by_deadline')),[1,2]);
  assert.deepEqual(ratio(metric(ar,'window_success_by_deadline')),[1,2]);
  // English has only fully reported direct costs: 0.30 / 2 verified briefings.
  close(metric(en,'provider_cost_per_verified_publication').value,.15);
  assert.equal(metric(en,'attributed_provider_cost').costScope,'directly_allocated_provider_operations_only');
  const arReadback=metric(ar,'cutoff_to_public_readback');
  assert.deepEqual([arReadback.n,arReadback.p50,arReadback.p95],[0,null,null]);
  assert.equal(metric(ar,'notification_service_acceptance').value,null,'no eligible units is not 100% delivery');
  assert.equal(metric(en,'operator_active_effort').activeMinutes,null,'no intervention records is not measured zero effort');
  assert.deepEqual(ratio(metric(slice(r,'sourceType','RSS'),'acquisition_acceptance')),[2,3]);
  assert.deepEqual(ratio(metric(slice(r,'sourceType','WEBSITE'),'acquisition_acceptance')),[0,1]);
  const covered=new Set(['experimentMode','cachePolicy',...r.campaigns[0].slices.map(s=>s.dimension)]);
  for(const required of catalog.requiredSlices)assert.ok(covered.has(required),required);
});
test('record order, duplicate imports and key order do not change the report',()=>{
  const records=parseEvidenceJsonl(text),base=JSON.stringify(build(records));
  const shuffled=[...records].reverse().map(r=>Object.fromEntries(Object.entries(r).reverse()));
  assert.equal(JSON.stringify(build(shuffled)),base);
  assert.equal(JSON.stringify(build([...records,...records]).campaigns),JSON.stringify(JSON.parse(base).campaigns));
});
test('contradictions keep the opportunity in denominators and the cost unknown at its highest ceiling',()=>{
  const records=parseEvidenceJsonl(text);
  const o1=structuredClone(records.find(r=>r.opportunityId==='o1'&&r.recordType==='opportunity'));o1.outcome='FAILED';
  const op1=structuredClone(records.find(r=>r.operationId==='op1'));Object.assign(op1,{actualCostUsd:.01,reservedCeilingUsd:.5});
  const r=build([...records,o1,op1]),all=slice(r,'all','all');
  assert.deepEqual(ratio(metric(all,'operational_window_success')),[2,6]);
  assert.equal(metric(all,'operational_window_success').outcomeCounts.UNKNOWN,1);
  const cost=metric(all,'attributed_provider_cost');
  assert.equal(cost.contradictedOperations,1);assert.equal(cost.unknownCostOperations,2);
  close(cost.knownReportedCostUsd,.25);close(cost.totalReservedCeilingsUsd,1.05);
  assert.equal(r.import.contradictions.length,2);
});
test('modes are never pooled and replay cutoffs are never subtracted from wall-clock observations',()=>{
  const records=parseEvidenceJsonl(text);
  const R='fixture-replay-c2',logical=at=>({at,clockDomain:'replay-logical',basis:'LOGICAL_REPLAY'});
  const wall=at=>({at,clockDomain:'wall',basis:'PROSPECTIVE_OBSERVATION'}),refs=[];
  const campaign={...records[0],campaignId:R,experimentMode:'FROZEN_REPLAY',
    clockDomains:[{id:'replay-logical',kind:'LOGICAL_REPLAY'},{id:'wall',kind:'WALL_UTC'}],observedUntil:logical('2026-10-20T12:00:00.000Z')};
  const opp={...records.find(r=>r.opportunityId==='o1'),campaignId:R,opportunityId:'r1',
    windowStart:logical('2026-10-20T10:00:00.000Z'),windowEnd:logical('2026-10-20T11:00:00.000Z'),outcomeAt:null,evidenceRefs:refs};
  const pub={recordType:'publication',schemaVersion:'0.1',campaignId:R,editionId:'replay-ed1',opportunityId:'r1',
    publishedAt:wall('2026-10-24T09:00:00.000Z'),readback:{lastNegativeAt:null,firstPositiveAt:wall('2026-10-24T09:00:01.000Z'),probeIntervalMs:null},evidenceRefs:refs};
  const r=build([...records,campaign,opp,pub]);
  assert.deepEqual(r.campaigns.map(c=>[c.campaignId,c.experimentMode]),[['fixture-offline-c1','OFFLINE_CONTRACT'],[R,'FROZEN_REPLAY']]);
  assert.equal(r.pooling.startsWith('none'),true);
  assert.equal(Object.keys(r).some(k=>k==='metrics'||k==='slices'),false,'no cross-campaign result exists');
  const replay=slice(r,'all','all',1);
  assert.deepEqual(ratio(metric(replay,'operational_window_success')),[1,1],'the opportunity stays in the denominator');
  assert.equal(metric(replay,'cutoff_to_public_readback').n,0);
  const coverage=metric(replay,'observability_coverage','cutoff_to_public_readback');
  assert.deepEqual(ratio(coverage),[0,1]);assert.deepEqual(coverage.unavailableByReason,{CROSS_CLOCK_DOMAIN:1});
  const deadline=metric(replay,'window_success_by_deadline');
  assert.equal(deadline.status,'not_assessed');assert.equal(deadline.reason,'CROSS_CLOCK_DOMAIN');
  // Offline campaign is unchanged by the presence of the replay campaign.
  assert.deepEqual(ratio(metric(slice(r,'all','all',0),'operational_window_success')),[3,6]);
});
test('proxy timestamps get their own labelled distribution and an unfrozen deadline is not assessed',()=>{
  const records=parseEvidenceJsonl(text).map(r=>{
    return JSON.parse(JSON.stringify(r).replaceAll('"basis":"SYNTHETIC_FIXTURE"','"basis":"PROSPECTIVE_OBSERVATION"'));
  });
  const campaign=records[0];Object.assign(campaign,{experimentMode:'CONTROLLED_LIVE',providerExecution:'DOUBLED',deadlineMs:null,
    clockDomains:[{id:'fixture-clock',kind:'WALL_UTC'}]});
  for(const r of records)if(r.recordType==='opportunity'){r.windowStart.basis='SCHEDULE';r.windowEnd.basis='SCHEDULE';}
  for(const r of records)if(r.recordType==='publication'&&r.editionId==='ed2')r.publishedAt.basis='APPLICATION_RECORDED_PROXY';
  const all=slice(build(records),'all','all');
  const push=all.filter(m=>m.metricId==='publication_to_push_service_acceptance');
  assert.deepEqual(push.map(m=>[m.clockBasis,m.proxy,m.n]),[
    ['APPLICATION_RECORDED_PROXY->PROSPECTIVE_OBSERVATION',true,1],['PROSPECTIVE_OBSERVATION->PROSPECTIVE_OBSERVATION',false,1]]);
  const deadline=metric(all,'window_success_by_deadline');
  assert.equal(deadline.status,'not_assessed');assert.equal(deadline.reason,'DEADLINE_NOT_FROZEN');assert.equal(deadline.value,undefined);
});
test('every reported metric traces to an offline_report catalog definition and to input record IDs',()=>{
  const r=reportFromBundle(text,{catalogText}),records=parseEvidenceJsonl(text);
  const known=new Set(records.flatMap(x=>[x.opportunityId,x.jobId,x.attemptId,x.editionId,x.unitId,x.interventionId,
    x.operationId&&x.provider+'/'+x.operationId]).filter(Boolean));
  const definitions=new Map(catalog.metrics.map(m=>[m.id,m])),emitted=new Set();
  for(const s of r.campaigns[0].slices)for(const m of s.metrics) {
    for(const id of [m.metricId,m.forMetric,m.summaryMethodMetricId].filter(Boolean)) {
      assert.equal(definitions.get(id)?.implementation,'offline_report',id);emitted.add(id);
    }
    assert.ok(m.evidence&&typeof m.evidence==='object',m.metricId);
    for(const ids of Object.values(m.evidence))for(const id of ids)assert.ok(known.has(id),m.metricId+' -> '+id);
  }
  for(const m of catalog.metrics.filter(x=>x.implementation==='offline_report'))assert.ok(emitted.has(m.id),'catalog claims '+m.id);
  const crippled={...catalog,metrics:catalog.metrics.map(m=>m.id==='window_resolution'?{...m,implementation:'protocol_only'}:m)};
  assert.throws(()=>buildReport(importEvidence(records),{bundleSha256:'0'.repeat(64),catalog:crippled,catalogSha256:'1'.repeat(64)}),/UNTRACEABLE_METRIC:window_resolution/);
});
test('representative failures follow the fixed rule and expose only IDs, codes and evidence references',()=>{
  const {representativeFailures:f}=reportFromBundle(text,{catalogText}).campaigns[0];
  assert.deepEqual(f.failures.map(x=>[x.opportunityId,x.effectiveOutcome]),[['o4','FAILED'],['o6','PERSISTED_UNCONFIRMED'],['o5','PENDING']]);
  assert.deepEqual(f.slowestSuccesses.map(x=>[x.opportunityId,x.latencyMs]),[['o2',2400000],['o1',600000]]);
  assert.match(f.rule,/Fixed before results are seen/);
});
test('CSV keeps unavailable values empty with an explicit status and quotes safely',()=>{
  const csv=reportToCsv(reportFromBundle(text,{catalogText})),lines=csv.trim().split('\n');
  assert.equal(lines[0],'campaignId,experimentMode,cachePolicy,sliceDimension,sliceValue,metricId,forMetric,clockBasis,proxy,unit,status,numerator,denominator,value,n,p50,p95,min,max');
  const rows=lines.slice(1).map(l=>l.split(','));
  const all=rows.filter(r=>r[3]==='all');
  assert.deepEqual(all.find(r=>r[5]==='operational_window_success').slice(10,14),['assessed','3','6','0.5']);
  assert.deepEqual(all.find(r=>r[5]==='provider_cost_per_verified_publication').slice(10,14),['unavailable','','2','']);
  assert.deepEqual(all.find(r=>r[5]==='cutoff_to_public_readback').slice(14),['2','1500000','2310000','600000','2400000']);
  assert.equal(all.find(r=>r[5]==='operator_active_effort')[10],'unavailable');
  assert.equal(all.find(r=>r[5]==='window_success_by_deadline')[10],'assessed');
  assert.equal(rows.length,reportFromBundle(text,{catalogText}).campaigns[0].slices.reduce((n,s)=>n+s.metrics.length,0));
});
test('CLI reproduces the report from the pinned bundle hash and refuses a changed bundle',()=>{
  const script=fileURLToPath(new URL('./report.mjs',import.meta.url)),bundle=fileURLToPath(fixtureUrl);
  const out=JSON.parse(execFileSync(process.execPath,[script,bundle,'--expect-bundle-sha256',sha(text)],{encoding:'utf8'}));
  assert.equal(JSON.stringify(out),JSON.stringify(reportFromBundle(text,{catalogText})));
  assert.throws(()=>execFileSync(process.execPath,[script,bundle,'--expect-bundle-sha256','0'.repeat(64)],{stdio:'pipe'}),/BUNDLE_HASH_MISMATCH/);
});
