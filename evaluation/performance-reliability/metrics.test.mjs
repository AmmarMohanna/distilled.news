import test from 'node:test';
import assert from 'node:assert/strict';
import {utcMillis,durationMs,proportion,wilson95,percentileR7,latencySummary,deadlineCohort,costSummary} from './metrics.mjs';

const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const ts=seconds=>new Date(Date.UTC(2026,9,24,0,0,seconds)).toISOString();
const charge=(operationId,actualCostUsd,confirmation='LEDGER_SETTLED',reservedCeilingUsd=.25)=>({
  operationId,provider:'fixture-provider',actualCostUsd,confirmation,reservedCeilingUsd});

test('UTC validation preserves milliseconds, rejects invalid calendar dates, offsets and guessed types',()=>{
  assert.equal(utcMillis('2026-10-24T19:05:40.123Z')%1000,123);
  assert.equal(utcMillis('2026-10-24T00:00:00Z'),utcMillis(ts(0)));
  for(const bad of ['2026-02-30T00:00:00Z','2026-13-01T00:00:00Z','2026-10-24','2026-10-24T00:00:00+00:00',undefined,0])
    assert.throws(()=>utcMillis(bad),/INVALID_UTC/);
});
test('durations retain real zero and missing null but never clamp contradictory clocks',()=>{
  assert.equal(durationMs(ts(1),ts(4)),3000);
  assert.equal(durationMs(ts(1),ts(1)),0);
  assert.equal(durationMs(null,ts(4)),null);
  assert.throws(()=>durationMs(ts(4),ts(1)),/NEGATIVE_DURATION/);
  assert.throws(()=>durationMs(ts(1),undefined),/INVALID_UTC/);
});
test('rates expose denominators and return unavailable rather than perfect for an empty population',()=>{
  assert.deepEqual(proportion(0,0),{numerator:0,denominator:0,value:null});
  assert.equal(proportion(0,5).value,0);
  assert.equal(proportion(3,4).value,.75);
  assert.throws(()=>proportion(1,0),/EXCEEDS/);
  for(const [n,d] of [[-1,2],[1,2.5],[NaN,2],[0,Infinity]])assert.throws(()=>proportion(n,d));
});
test('R7 uses frozen interpolation, does not mutate inputs and does not silently discard bad observations',()=>{
  const data=[4,1,3,2];
  close(percentileR7(data,.95),3.85);
  assert.equal(percentileR7(data,.5),2.5);
  assert.equal(percentileR7(data,0),1);assert.equal(percentileR7(data,1),4);
  assert.deepEqual(data,[4,1,3,2]);
  assert.equal(percentileR7([], .95),null);assert.equal(percentileR7([0],.95),0);
  assert.throws(()=>percentileR7([1,NaN],.95));assert.throws(()=>percentileR7([1],1.1));
});
test('latency reports are explicitly descriptive with sample counts and small-tail warning',()=>{
  assert.equal(latencySummary([]).p95,null);assert.equal(latencySummary([]).n,0);
  assert.match(latencySummary([1,2,3]).tailWarning,/exploratory/);
  assert.equal(latencySummary([0,0]).p50,0);
  assert.throws(()=>latencySummary([-1,2]));
});
test('large latency populations do not overflow function argument limits',()=>{
  const r=latencySummary(Array(150000).fill(10));
  assert.equal(r.n,150000);assert.equal(r.min,10);assert.equal(r.max,10);assert.equal(r.p95,10);
});
test('Wilson reference limits match hand-checkable independent-binomial examples including zero/all successes',()=>{
  assert.equal(wilson95(0,0).interval,null);
  close(wilson95(0,10).interval.upper,.2775327998628892);
  close(wilson95(10,10).interval.lower,.7224672001371107);
  close(wilson95(50,100).interval.lower,.4038315303659957);
  close(wilson95(50,100).interval.upper,.5961684696340044);
  assert.match(wilson95(1,1).method,/independent-trials-only/);
});
test('deadline cohorts keep mature failures, late successes, immature and not-yet-due opportunities distinct',()=>{
  const r=deadlineCohort([
    {opportunityId:'on-time',dueAt:ts(0),successAt:ts(5)},
    {opportunityId:'late',dueAt:ts(0),successAt:ts(15)},
    {opportunityId:'no-success',dueAt:ts(0),successAt:null},
    {opportunityId:'immature',dueAt:ts(15),successAt:null},
    {opportunityId:'future',dueAt:ts(30),successAt:null}
  ],{observedUntil:ts(20),deadlineMs:10000});
  assert.deepEqual(r.deadlineSuccess,{numerator:1,denominator:3,value:1/3});
  assert.equal(r.due,4);assert.equal(r.immature,1);assert.equal(r.future,1);
  assert.equal(r.observedSuccesses,2);
  assert.deepEqual([r.dueCohortBounds.lower,r.dueCohortBounds.upper],[.25,.5]);
});
test('deadline boundary is inclusive; future-known outcomes cannot leak into as-of success',()=>{
  const rows=[{opportunityId:'one',dueAt:ts(0),successAt:ts(10)}];
  assert.equal(deadlineCohort(rows,{observedUntil:ts(10),deadlineMs:10000}).deadlineSuccess.value,1);
  const before=deadlineCohort(rows,{observedUntil:ts(9),deadlineMs:10000});
  assert.equal(before.observedSuccesses,0);assert.equal(before.deadlineSuccess.value,null);
  assert.deepEqual([before.dueCohortBounds.lower,before.dueCohortBounds.upper],[0,1]);
});
test('opportunity identity and chronology errors are rejected instead of reducing the denominator',()=>{
  const r={opportunityId:'one',dueAt:ts(5),successAt:ts(6)},options={observedUntil:ts(20),deadlineMs:10000};
  assert.throws(()=>deadlineCohort([r,r],options),/DUPLICATE/);
  assert.throws(()=>deadlineCohort([{...r,successAt:ts(4)}],options),/PRECEDES/);
  assert.throws(()=>deadlineCohort([r],{...options,deadlineMs:-1}));
});
test('shared receipt join duplicates incur one operation cost, not one charge per referencing story',()=>{
  const a=charge('canonical-op',.1);
  const r=costSummary([a,{...a}],2);
  assert.equal(r.operations,1);assert.equal(r.duplicateJoinRows,1);
  close(r.fullyReportedCostUsd,.1);close(r.costPerPublishedReportedUsd,.05);
  assert.equal(r.unsettledRecordedExposureUsd,0);
});
test('unknown charges retain exposure and make full cost ratios unavailable even when other costs are settled',()=>{
  const r=costSummary([charge('known',.1),charge('unknown',null,'UNKNOWN')],1);
  close(r.knownReportedCostUsd,.1);assert.equal(r.fullyReportedCostUsd,null);
  assert.equal(r.costPerPublishedReportedUsd,null);assert.equal(r.unknownCostOperations,1);
  close(r.unsettledRecordedExposureUsd,.25);assert.equal(r.settlementCoverage.value,.5);
});
test('provider reporting is distinguished from settlement and zero result cost ratios stay null',()=>{
  const r=costSummary([charge('failed-but-billed',.3,'PROVIDER_REPORTED',.25)],0);
  close(r.knownReportedCostUsd,.3);close(r.unsettledRecordedExposureUsd,.3);
  assert.equal(r.ledgerSettledCostUsd,0);assert.equal(r.settlementCoverage.value,0);
  assert.equal(r.costPerPublishedReportedUsd,null);
  const empty=costSummary([],0);assert.equal(empty.settlementCoverage.value,null);assert.equal(empty.costPerPublishedReportedUsd,null);
});
test('conflicting financial identity, estimates masquerading as actuals and malformed values cannot silently pass',()=>{
  assert.throws(()=>costSummary([charge('one',.1),charge('one',.2)],1),/CONFLICTING/);
  assert.throws(()=>costSummary([charge('one',null)],1),/INCONSISTENT/);
  assert.throws(()=>costSummary([charge('one',0,'UNKNOWN')],1),/INCONSISTENT/);
  assert.throws(()=>costSummary([charge('one',-.1)],1),/INVALID_NUMBER/);
  assert.throws(()=>costSummary([charge('one',.1,'ESTIMATE')],1),/INVALID_COST_CONFIRMATION/);
  assert.throws(()=>costSummary([charge('one',.1)],1.5),/INVALID_COUNT/);
  assert.throws(()=>costSummary([charge('one',Number.MAX_VALUE),charge('two',Number.MAX_VALUE)],1),/aggregate/);
});
