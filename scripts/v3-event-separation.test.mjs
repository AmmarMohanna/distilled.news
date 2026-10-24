import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {candidate,EVENT_SEPARATION,replay,referenceReviewFlags} from '../benchmarks/v3-event-separation.mjs';
const baseline=JSON.parse(fs.readFileSync(new URL('../benchmarks/prompts/v3-v1.json',import.meta.url),'utf8'));
test('changes only one grouping paragraph and preserves every other instruction',()=>{
 for(const stage of ['editor','consolidate']){
  const before=baseline.systems[stage].split('\n'),after=candidate(baseline.systems[stage],stage).split('\n');
  assert.equal(before.length,after.length);
  const changes=before.flatMap((line,i)=>line===after[i]?[]:[i]);
  assert.equal(changes.length,1);
  assert.ok(after[changes[0]].includes(EVENT_SEPARATION));
 }
 assert.throws(()=>candidate('changed baseline','editor'),/BASELINE_RULE_DRIFT/);
});
test('replays observed grouping errors separately from valid same-occurrence consolidation',()=>{
 const result=replay();
 assert.equal(result.paidCalls,0);
 assert.equal(result.observedArabicGroupingFlags.length,1);
 assert.deepEqual(result.baselineEnglishGroupingFlags,[]);
 assert.deepEqual(result.sameOccurrenceControl,[]);
 assert.equal(result.consolidationGroupingFlags.length,1);
 assert.equal(result.observedArabicGroupingFlags[0].requiresSourceReview,true);
});
test('does not misattribute baseline verifier approval to the merged Arabic candidate',()=>{
 const trace=replay().verifierTrace;
 assert.deepEqual(trace.checkedItemNumbers,[0,1,2,3]);
 assert.equal(trace.mergedBodyPresentInCheckedItems,false);
});
test('keeps review heuristics out of product code and leaves unknown references unjudged',()=>{
 assert.deepEqual(referenceReviewFlags([{sources:['S1','unknown']}],{S1:'known'}),[]);
 const plan=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-event-separation/preflight.json',import.meta.url),'utf8'));
 assert.equal(plan.status,'NOT_AUTHORIZED_NO_REQUESTS_SENT');
 assert.equal(plan.newCalls,6);
 assert.ok(plan.maximumExposureUsd<.35);
 assert.equal(plan.unusedWindow.controlledProfileOverride,true);
 assert.equal(plan.repairCalls+plan.verifierCalls,0);
});
