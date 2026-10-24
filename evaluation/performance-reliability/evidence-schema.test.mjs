import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateRecord,recordIdentity,canonicalJson,RECORD_SCHEMAS} from './evidence-schema.mjs';
import {parseEvidenceJsonl} from './import-evidence.mjs';

// Entirely synthetic metadata fixture. It contains no article text.
const fixture=parseEvidenceJsonl(fs.readFileSync(new URL('./fixtures/offline-contract.jsonl',import.meta.url),'utf8'));
const first=type=>structuredClone(fixture.find(r=>r.recordType===type));
const errors=r=>validateRecord(r).join('\n');

test('every fixture record type validates and every schema has a fixture example',()=>{
  for(const r of fixture)assert.deepEqual(validateRecord(r),[],recordIdentity(r));
  for(const type of Object.keys(RECORD_SCHEMAS))assert.ok(fixture.some(r=>r.recordType===type),type);
});
test('article text, prompts or any undeclared field are rejected rather than carried along',()=>{
  for(const [type,key] of [['opportunity','text'],['publication','body'],['attempt','prompt'],['campaign','apiKey']]) {
    const r=first(type);r[key]='Synthetic sentence that must not be stored.';
    assert.match(errors(r),new RegExp(key+': UNKNOWN_FIELD'));
  }
  const nested=first('publication');nested.readback.html='<p>x</p>';
  assert.match(errors(nested),/readback\.html: UNKNOWN_FIELD/);
  const prose=first('opportunity');prose.outcomeReason='The model failed because the article said something';
  assert.match(errors(prose),/outcomeReason: INVALID_REASON_CODE/);
  const longId=first('opportunity');longId.opportunityId='x'.repeat(201);
  assert.match(errors(longId),/opportunityId: INVALID_ID/);
});
test('omitted fields are errors: unknown values must be an explicit null',()=>{
  const r=first('opportunity');delete r.outcomeAt;
  assert.match(errors(r),/outcomeAt: MISSING_FIELD/);
  const c=first('financialOperation');delete c.actualCostUsd;
  assert.match(errors(c),/actualCostUsd: MISSING_FIELD/);
});
test('types, enums, versions, hashes and UTC timestamps are strict',()=>{
  const cases=[
    ['opportunity',r=>{r.outcome='SUCCESS';},/outcome: INVALID_ENUM/],
    ['opportunity',r=>{r.schemaVersion='0.2';},/schemaVersion: EXPECTED_0.1/],
    ['opportunity',r=>{r.windowEnd.at='2026-10-24T01:00:00+00:00';},/windowEnd\.at: INVALID_UTC_TIMESTAMP/],
    ['opportunity',r=>{r.windowEnd.basis='GUESSED';},/windowEnd\.basis: INVALID_ENUM/],
    ['opportunity',r=>{r.caseId='case-1';r.inputSha256='ABC';},/inputSha256: INVALID_SHA256/],
    ['opportunity',r=>{r.language='english';},/language: INVALID_ENUM/],
    ['attempt',r=>{r.attemptIndex=1.5;},/attemptIndex: INVALID_COUNT/],
    ['financialOperation',r=>{r.reservedCeilingUsd=-1;},/reservedCeilingUsd: INVALID_USD/],
    ['financialOperation',r=>{r.confirmation='ESTIMATE';},/confirmation: INVALID_ENUM/],
    ['campaign',r=>{r.deadlineMs='30m';},/deadlineMs: INVALID_COUNT/],
    ['campaign',r=>{r.clockDomains=[];},/clockDomains: TOO_FEW_ITEMS/],
    ['subscriptionReceipt',r=>{r.observedFullHorizon='yes';},/observedFullHorizon: INVALID_BOOLEAN/]];
  for(const [type,mutate,expected] of cases){const r=first(type);mutate(r);assert.match(errors(r),expected);}
  assert.deepEqual(validateRecord({recordType:'story'}),['recordType: UNSUPPORTED_RECORD_TYPE']);
  assert.deepEqual(validateRecord(null),['recordType: UNSUPPORTED_RECORD_TYPE']);
});
test('record-level chronology and evidence consistency are enforced within one clock domain',()=>{
  const w=first('opportunity');w.windowEnd.at=w.windowStart.at;
  assert.match(errors(w),/EMPTY_OR_NEGATIVE_WINDOW/);
  const x=first('opportunity');x.windowEnd.clockDomain='other-clock';
  assert.match(errors(x),/WINDOW_CROSSES_CLOCK_DOMAINS/);
  const q=fixture.find(r=>r.outcome==='QUIET');const early=structuredClone(q);early.outcomeAt.at='2026-10-24T00:59:59.999Z';
  assert.match(errors(early),/SUCCESS_PRECEDES_CUTOFF/);
  const failedEarly=structuredClone(fixture.find(r=>r.outcome==='FAILED'));
  assert.deepEqual(validateRecord(failedEarly),[],'a failure may be decided before the cutoff');
  const pairing=first('opportunity');pairing.caseId='case-1';
  assert.match(errors(pairing),/CASE_AND_HASH_MUST_BE_PAIRED/);
  const a=first('attempt');a.completedAt={...a.startedAt,at:'2026-10-24T00:29:59.000Z'};
  assert.match(errors(a),/TIMESTAMPS_OUT_OF_ORDER/);
  const done=first('attempt');done.completedAt=null;
  assert.match(errors(done),/FINISHED_ATTEMPT_WITHOUT_COMPLETION/);
  const unknownCost=first('financialOperation');unknownCost.confirmation='UNKNOWN';
  assert.match(errors(unknownCost),/INCONSISTENT_COST_EVIDENCE/);
  const shared=first('financialOperation');shared.allocation='UNALLOCATED_SHARED';
  assert.match(errors(shared),/ALLOCATION_OPPORTUNITY_MISMATCH/);
  const receipt=first('subscriptionReceipt');receipt.acceptedAt=null;
  assert.match(errors(receipt),/ACCEPTANCE_TIME_MISMATCH/);
  const p=first('publication');p.readback.firstPositiveAt={...p.publishedAt,at:'2026-10-24T01:04:00.000Z'};p.readback.lastNegativeAt=null;
  assert.match(errors(p),/READBACK_PRECEDES_PUBLICATION/);
  const real=first('campaign');real.providerExecution='REAL';
  assert.match(errors(real),/REAL_PROVIDER_IN_OFFLINE_MODE/);
});
test('identities are type-scoped and financial operations are globally scoped by provider and billing ID',()=>{
  const op=first('financialOperation');
  assert.equal(recordIdentity(op),recordIdentity({...op,campaignId:'another-campaign'}));
  const o=first('opportunity');
  assert.notEqual(recordIdentity(o),recordIdentity({...o,campaignId:'another-campaign'}));
  assert.equal(canonicalJson({b:1,a:[{d:2,c:null}]}),canonicalJson({a:[{c:null,d:2}],b:1}));
});
