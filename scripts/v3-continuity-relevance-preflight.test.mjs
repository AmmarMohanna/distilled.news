import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-continuity-relevance/preflight.json',import.meta.url),'utf8'));
const frozen=JSON.parse(fs.readFileSync(new URL('../benchmarks/prompts/v3-v1.json',import.meta.url),'utf8'));
test('freezes independent continuity and relevance changes without combining them',()=>{
 for(const changed of Object.values(p.independentVariables)){
  const before=frozen.systems.editor.split('\n'),after=changed.split('\n');
  assert.equal(before.length,after.length);assert.equal(before.filter((line,index)=>line!==after[index]).length,1);
 }
 assert.equal(p.cases.length,5);assert.equal(p.jobs.length,10);
});
test('matches inputs and all model settings within every frozen pair',()=>{
 for(const c of p.cases){
  const b=p.jobs.find(j=>j.caseId===c.id&&j.variant==='baseline'),v=p.jobs.find(j=>j.caseId===c.id&&j.variant==='candidate');
  assert.equal(b.userSha256,v.userSha256);assert.deepEqual(b.configuration,v.configuration);
  assert.equal(b.configuration.model,'openai/gpt-4.1');assert.equal(b.configuration.temperature,.1);
  assert.equal(b.configuration.max_tokens,4000);
 }
});
test('preserves ambiguity, synthetic labels and legitimate regional editorial choices',()=>{
 const ambiguous=p.cases.find(c=>c.id==='real-lebanon-ambiguous-repeat');
 assert.ok(ambiguous.expected.notGroundTruth.includes('Neither forced inclusion nor forced omission'));
 const synthetic=p.cases.find(c=>c.id==='synthetic-occurrence-update-correction');
 assert.ok(synthetic.labelStatus.includes('synthetic'));assert.equal(synthetic.syntheticInput.articles.length,4);
 for(const c of p.cases.filter(c=>c.experiment==='relevance')){
  assert.equal(c.expected.noPenaltyForLegitimateOptionalChoices,true);
  assert.equal(c.provenance.notActualAcquisitionWindow,true);
 }
 assert.equal(p.oilCoreBodyEqualityVerified,true);
});
test('preserves the pre-authorization snapshot and adds no product stages',()=>{
 assert.equal(p.status,'NOT_AUTHORIZED');assert.equal(p.requestedCeilingUsd,.56);
 assert.ok(Math.abs(p.jobs.reduce((sum,j)=>sum+j.maximumUsd,0)-p.maximumExposureUsd)<1e-10);
 assert.ok(p.maximumExposureUsd<.56);
 assert.deepEqual(p.scope,{retries:0,repairs:0,verifierCalls:0,deployments:0,publications:0});
});

const paid=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-continuity-relevance/results.json',import.meta.url),'utf8'));
const review=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-continuity-relevance/review.json',import.meta.url),'utf8'));
const result=id=>paid.pairs.find(pair=>pair.caseId===id);
test('ties every paid result back to the frozen input and model configuration',()=>{
 assert.equal(paid.pairs.length,5);
 for(const pair of paid.pairs){
  const b=p.jobs.find(j=>j.caseId===pair.caseId&&j.variant==='baseline'),v=p.jobs.find(j=>j.caseId===pair.caseId&&j.variant==='candidate');
  assert.equal(pair.baseline.requestSha256,b.requestSha256);assert.equal(pair.candidate.requestSha256,v.requestSha256);
  assert.equal(pair.exactUserInputSha256,b.userSha256);assert.equal(pair.changedParagraphs,1);
  assert.deepEqual(pair.exactModelConfiguration,b.configuration);
  assert.equal(pair.baseline.provider,pair.candidate.provider);
 }
});
test('keeps explicit new occurrences, updates and corrections while suppressing real and synthetic repeats',()=>{
 for(const variant of ['baseline','candidate']){
  assert.deepEqual(result('real-oil-repeat')[variant].output.items,[]);
  const items=result('synthetic-occurrence-update-correction')[variant].output.items;
  assert.equal(items.length,3);
  assert.ok(items.some(i=>i.sources.includes('S1')&&i.relation==='new'&&i.updates===null));
  assert.ok(items.some(i=>i.sources.includes('S3')&&i.relation==='update'&&i.updates==='prior-service'));
  assert.ok(items.some(i=>i.sources.includes('S4')&&i.relation==='correction'&&i.updates==='prior-evacuation'));
  assert.ok(items.every(i=>!i.sources.includes('S2')));
 }
 assert.ok(review.cases.find(c=>c.id==='synthetic-occurrence-update-correction').supportedCompression.includes('not a factual omission'));
});
test('does not turn an ambiguous omission or optional regional selection into manufactured gold',()=>{
 assert.equal(review.cases.find(c=>c.id==='real-lebanon-ambiguous-repeat').forcedInclusionOrOmissionScored,false);
 for(const language of ['en','ar'])for(const variant of ['baseline','candidate']){
  const items=result('real-lebanon-relevance-'+language)[variant].output.items;
  assert.equal(items.length,1);assert.deepEqual(items[0].sources,['S4']);
 }
 assert.ok(review.productionGap.includes('does not reproduce'));
 assert.equal(paid.decision,'KEEP_BASELINE_NO_DEMONSTRATED_IMPROVEMENT');
 assert.equal(paid.runtimeChanges,0);assert.equal(paid.verifierCalls,0);
});
test('reconciles all ten charges without presenting reserved limits or editor drafts as publication',()=>{
 const ledger=JSON.parse(fs.readFileSync(new URL('../benchmarks/results/v3-continuity-relevance/ledger-summary.json',import.meta.url),'utf8'));
 assert.equal(ledger.newCalls,10);assert.equal(ledger.settledCalls,10);assert.equal(ledger.outstandingUsd,0);
 const actual=paid.pairs.reduce((sum,pair)=>sum+pair.baseline.usage.cost+pair.candidate.usage.cost,0);
 assert.ok(Math.abs(actual-ledger.actualUsd)<1e-10);assert.ok(Math.abs(actual-.058956)<1e-10);
 assert.ok(ledger.maximumReservationsUsd<ledger.authorizationCeilingUsd);
 assert.equal(paid.deployments,0);assert.equal(paid.repairCalls,0);
 assert.equal(review.crossChecks.sourceReviewIsNotVerifierApproval,true);
});
