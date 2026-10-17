import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from './summarize-briefing-latency.mjs';

test('uses nearest-rank percentiles and does not double-count replayed model receipts',()=>{
 const records=[1,2,3,4,100].map(durationMs=>({type:'V1_PIPELINE_LATENCY',phase:'REVIEW',durationMs,outcome:'SUCCEEDED',stages:{CAS_COMMIT:{count:2,durationMs:durationMs/2}},counts:{casAttempts:2}}));
 records.push(...[1,2].map(attempt=>({type:'V1_PIPELINE_LATENCY',phase:'MODEL',operationId:'request-'+attempt,receiptOperationId:'same-paid-receipt',durationMs:1,counts:{receiptReportedCostUsd:.01,reportedUsage:1,newProviderCalls:attempt===1?1:0}})));
 const summary=summarize(records);
 assert.equal(summary.phases.REVIEW.durationMs.p50,3);assert.equal(summary.phases.REVIEW.durationMs.p95,100);
 assert.equal(summary.uniqueReportedModelCostUsd,.01);assert.equal(summary.phases.REVIEW.counts.casAttempts,10);
 assert.equal(summary.phases.REVIEW.stages.CAS_COMMIT.operations,10);
});
test('ignores arbitrary payloads and groups queue backpressure without private content',()=>{
 const summary=summarize([{type:'prompt',body:'secret'}, {type:'V1_QUEUE_LATENCY',durationMs:4,queueWaitMs:10,outcome:'FEED_TURN_BUSY'},{type:'V1_PIPELINE_LATENCY',phase:'__proto__',durationMs:7}]);
 assert.equal(summary.queue.outcomes.FEED_TURN_BUSY,1);assert.equal(summary.queue.waitMs.p95,10);
 assert.equal(JSON.stringify(summary).includes('secret'),false);
});
