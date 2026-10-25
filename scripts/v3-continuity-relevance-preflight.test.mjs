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
test('requires new bounded authorization and adds no product stages',()=>{
 assert.equal(p.status,'NOT_AUTHORIZED');assert.equal(p.requestedCeilingUsd,.56);
 assert.ok(Math.abs(p.jobs.reduce((sum,j)=>sum+j.maximumUsd,0)-p.maximumExposureUsd)<1e-10);
 assert.ok(p.maximumExposureUsd<.56);
 assert.deepEqual(p.scope,{retries:0,repairs:0,verifierCalls:0,deployments:0,publications:0});
});
