import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
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

const paid=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-event-separation/paired-comparison.json',import.meta.url),'utf8'));
const {auditPair}=await import('../benchmarks/v3-event-separation.mjs');
test('audits all paid candidates against exact request bytes, routing and original baseline',()=>{
 assert.equal(paid.pairs.length,4);
 for(const pair of paid.pairs){
  assert.deepEqual(auditPair(pair.baselineRequest,pair.candidateRequest,pair.stage),{exactSameUserInput:true,exactSameModelConfiguration:true,onlyGroupingInstructionChanged:true});
  assert.equal(createHash('sha256').update(JSON.stringify(pair.baselineRequest)).digest('hex'),pair.baselineRequestSha256);
  assert.equal(createHash('sha256').update(JSON.stringify(pair.candidateRequest)).digest('hex'),pair.candidateRequestSha256);
  assert.equal(pair.baselineResult.requestSha256,pair.baselineRequestSha256);
  assert.equal(pair.candidateResult.requestSha256,pair.candidateRequestSha256);
 }
});
test('detects hidden changes to evidence, models, sampling or unrelated prompt rules',()=>{
 const pair=paid.pairs[0],change=()=>structuredClone(pair.candidateRequest);
 let request=change();request.messages[1].content+='\n';assert.throws(()=>auditPair(pair.baselineRequest,request,pair.stage),/INPUT_DRIFT/);
 request=change();request.model='openai/gpt-4.1-mini';assert.throws(()=>auditPair(pair.baselineRequest,request,pair.stage),/MODEL_CONFIGURATION_DRIFT/);
 request=change();request.temperature=.2;assert.throws(()=>auditPair(pair.baselineRequest,request,pair.stage),/MODEL_CONFIGURATION_DRIFT/);
 request=change();request.messages[0].content+='\nChange the reading budget.';assert.throws(()=>auditPair(pair.baselineRequest,request,pair.stage),/SYSTEM_SCOPE_DRIFT/);
});
test('checks valid same-occurrence grouping and lost important developments independently',()=>{
 const arabic=paid.pairs.find(p=>p.id==='known-arabic');
 for(const output of [arabic.baselineResult.output,arabic.candidateResult.output]){
  const related=output.items.filter(i=>i.sources.some(s=>['S7','S8'].includes(s)));
  assert.equal(related.length,1);assert.deepEqual(new Set(related[0].sources),new Set(['S7','S8']));
 }
 const consolidation=paid.pairs.find(p=>p.id==='known-consolidation'),priority=[0,1,10,11,12,15];
 const present=output=>new Set(output.items.flatMap(i=>i.from));
 assert.equal(priority.filter(i=>present(consolidation.baselineResult.output).has(i)).length,6);
 assert.equal(priority.filter(i=>present(consolidation.candidateResult.output).has(i)).length,3);
 const merged=consolidation.candidateResult.output.items.find(i=>i.from.includes(0)&&i.from.includes(3));
 assert.ok(merged.body.includes('Barclays'));assert.ok(merged.body.includes('Enterprise Frontier Safeguards'));
});
test('keeps paid accounting and source recovery distinct from unearned quality claims',()=>{
 const ledger=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-event-separation/ledger-summary.json',import.meta.url),'utf8'));
 assert.equal(ledger.calls,6);assert.equal(ledger.settledCalls,6);assert.equal(ledger.outstandingUsd,0);assert.ok(ledger.actualUsd<.35);
 const recovery=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-event-separation/source-recovery-summary.json',import.meta.url),'utf8'));
 assert.equal(recovery.original95ArchiveRecovered,false);assert.equal(recovery.readOnlyChecks.rowsWritten,0);
 assert.equal(recovery.historicalSnapshot.matchingKnownSourceHashes,20);assert.equal(recovery.reconstructedWorldTrack.windows,46);
 assert.notEqual(recovery.reconstructedWorldTrack.recurrenceIndicators.laterOccurrences,recovery.reconstructedWorldTrack.oldReportIndicators.laterOccurrences);
});
