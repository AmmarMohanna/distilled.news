import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseEvidenceJsonl,importEvidence} from './import-evidence.mjs';

const text=fs.readFileSync(new URL('./fixtures/offline-contract.jsonl',import.meta.url),'utf8');
const fixture=()=>parseEvidenceJsonl(text);
const find=(records,predicate)=>records.find(predicate);
const opportunity=(records,id)=>find(records,r=>r.recordType==='opportunity'&&r.opportunityId===id);
const rejects=(records,pattern)=>assert.throws(()=>importEvidence(records),e=>pattern.test(e.message));

test('JSON Lines parsing ignores blank lines and names the malformed line',()=>{
  assert.equal(parseEvidenceJsonl('\n'+text+'\n\n').length,fixture().length);
  assert.throws(()=>parseEvidenceJsonl(text+'{not json\n'),/INVALID_JSONL_LINE:31/);
});
test('importing the same evidence twice is idempotent and counts duplicates instead of evidence',()=>{
  const once=importEvidence(fixture()),twice=importEvidence([...fixture(),...fixture()]);
  assert.equal(once.uniqueRecords,29);assert.equal(once.duplicateRecords,1,'fixture repeats one financial join row');
  assert.equal(twice.uniqueRecords,29);assert.equal(twice.duplicateRecords,31);
  assert.equal(twice.campaigns.get('fixture-offline-c1').financialOperations.size,4);
  const reordered=fixture().map(r=>Object.fromEntries(Object.entries(r).reverse()));
  assert.equal(importEvidence([...fixture(),...reordered]).contradictions.length,0,'key order is not a contradiction');
});
test('a contradicted opportunity stays in the denominator as UNKNOWN and both variants are reported',()=>{
  const records=fixture(),changed=structuredClone(opportunity(records,'o3'));changed.outcome='FAILED';
  const r=importEvidence([...records,changed]);
  assert.equal(r.contradictions.length,1);
  assert.equal(r.contradictions[0].variantSha256.length,2);
  const entry=r.campaigns.get('fixture-offline-c1').opportunities.get('o3');
  assert.equal(entry.effectiveOutcome,'UNKNOWN');assert.equal(entry.contradicted,true);
  assert.ok(r.diagnostics.some(d=>d.code==='CONTRADICTORY_OPPORTUNITY_RECORDS'&&d.opportunityId==='o3'));
});
test('a contradicted financial operation is retained with both variants rather than picking the cheaper one',()=>{
  const records=fixture(),op=structuredClone(find(records,r=>r.operationId==='op2'));op.actualCostUsd=.01;
  const entry=importEvidence([...records,op]).campaigns.get('fixture-offline-c1').financialOperations.get(JSON.stringify(['fixture-provider','op2']));
  assert.equal(entry.contradicted,true);
  assert.deepEqual(entry.variants.map(v=>v.actualCostUsd).sort(),[.01,.2]);
});
test('one billing identity attributed to two campaigns is rejected',()=>{
  const records=fixture(),campaign=structuredClone(find(records,r=>r.recordType==='campaign'));campaign.campaignId='fixture-offline-c2';
  const op=structuredClone(find(records,r=>r.operationId==='op4'));op.campaignId='fixture-offline-c2';
  rejects([...records,campaign,op],/OPERATION_ATTRIBUTED_TO_MULTIPLE_CAMPAIGNS/);
});
test('claimed read-back without confirming evidence is not counted as published',()=>{
  const records=fixture().filter(r=>r.editionId!=='ed1');
  const r=importEvidence(records);
  assert.equal(r.campaigns.get('fixture-offline-c1').opportunities.get('o1').effectiveOutcome,'UNKNOWN');
  assert.ok(r.diagnostics.some(d=>d.code==='PUBLISHED_READBACK_WITHOUT_CONFIRMED_READBACK'&&d.opportunityId==='o1'));
  const late=fixture(),pub=find(late,r=>r.editionId==='ed1'&&r.recordType==='publication');
  pub.readback.firstPositiveAt.at='2026-10-24T03:20:00.001Z';
  assert.equal(importEvidence(late).campaigns.get('fixture-offline-c1').opportunities.get('o1').effectiveOutcome,'UNKNOWN',
    'read-back after the observation horizon cannot leak into the as-of result');
});
test('two confirmed editions for one opportunity are flagged as a safety invariant',()=>{
  const records=fixture(),extra=structuredClone(find(records,r=>r.editionId==='ed1'&&r.recordType==='publication'));extra.editionId='ed1-dup';
  const d=importEvidence([...records,extra]).diagnostics.find(x=>x.code==='DUPLICATE_LOGICAL_PUBLICATION');
  assert.deepEqual(d.editionIds,['ed1','ed1-dup']);assert.equal(d.safetyInvariant,true);
});
test('missing campaign, foreign references and contradictory manifests are fatal',()=>{
  rejects(fixture().filter(r=>r.recordType!=='campaign'),/UNKNOWN_CAMPAIGN/);
  const records=fixture(),job=find(records,r=>r.jobId==='j1');job.opportunityId='missing';
  rejects(records,/UNKNOWN_OPPORTUNITY_IN_CAMPAIGN/);
  const attempt=fixture();find(attempt,r=>r.attemptId==='a1').parentId='nowhere';
  rejects(attempt,/UNKNOWN_PARENT_IN_CAMPAIGN/);
  const receipt=fixture();find(receipt,r=>r.unitId==='ed1-s1').editionId='ed-missing';
  rejects(receipt,/UNKNOWN_EDITION_IN_CAMPAIGN/);
  const manifest=fixture(),c=structuredClone(find(manifest,r=>r.recordType==='campaign'));c.deadlineMs=1;
  rejects([...manifest,c],/CONTRADICTORY_CAMPAIGN_MANIFEST/);
});
test('changing a clock domain, a mode-incompatible basis or a frozen input hash fails validation',()=>{
  const domain=fixture();opportunity(domain,'o1').windowEnd.clockDomain='other-clock';opportunity(domain,'o1').windowStart.clockDomain='other-clock';
  rejects(domain,/UNDECLARED_CLOCK_DOMAIN/);
  const basis=fixture();find(basis,r=>r.editionId==='ed1').publishedAt.basis='APPLICATION_RECORDED_PROXY';
  rejects(basis,/BASIS_NOT_ALLOWED_IN_OFFLINE_CONTRACT/);
  const hash='a'.repeat(64),frozen=fixture(),campaign=find(frozen,r=>r.recordType==='campaign');
  campaign.inputs=[{caseId:'case-1',sha256:hash}];
  Object.assign(opportunity(frozen,'o1'),{caseId:'case-1',inputSha256:hash});
  assert.doesNotThrow(()=>importEvidence(frozen));
  opportunity(frozen,'o1').inputSha256='b'.repeat(64);
  rejects(frozen,/INPUT_HASH_MISMATCH/);
  opportunity(frozen,'o1').caseId='case-unfrozen';
  rejects(frozen,/INPUT_HASH_MISMATCH/);
});
test('schema errors from every record are reported together',()=>{
  const records=fixture();delete records[1].feedId;records[2].outcome='WIN';
  assert.throws(()=>importEvidence(records),e=>e.code==='EVIDENCE_SCHEMA_INVALID'&&e.details.length===2);
});
