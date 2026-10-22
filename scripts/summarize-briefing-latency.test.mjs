import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,recordsFromText,decodeLog} from './summarize-briefing-latency.mjs';

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

test('reads consecutive multiline Wrangler events and JSONL without exposing other logs',()=>{
 const record={type:'V1_PIPELINE_LATENCY',phase:'REVIEW',durationMs:12,outcome:'SUCCEEDED'};
 const event={logs:[{message:['legacy private {"text":"escaped \\\" }"}',JSON.stringify(record)]}],exceptions:[]};
 const raw='Connected\n'+JSON.stringify(event,null,4)+'\n'+JSON.stringify(event,null,4)+'\n';
 assert.deepEqual(recordsFromText(raw),[record,record]);
 assert.deepEqual(recordsFromText(JSON.stringify(record)+'\n'+JSON.stringify(record)),[record,record]);
 assert.equal(JSON.stringify(summarize(recordsFromText(raw))).includes('private'),false);
 const redirected=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(raw,'utf16le')]);
 assert.deepEqual(recordsFromText(decodeLog(redirected)),[record,record]);
 assert.deepEqual(recordsFromText(decodeLog(Buffer.from(raw))),[record,record]);
});
