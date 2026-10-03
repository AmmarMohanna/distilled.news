import { beforeEach, afterEach, expect, it } from 'vitest';
import { handoffConnectorBatch, type IntakeReceipt, type NormalizedEvidenceItem } from '@distilled/contracts';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy, scopeFixture, seedCurrentEvidence } from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>, store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});
afterEach(async()=>ctx.dispose());
it('accepted UPSERT commits a candidate, exact input binding and one acquisition job',async()=>{
  const result=await handoffConnectorBatch(createCandidateIntakePort(store,testPolicy),batchFixture());
  expect(result.receipts[0]).toMatchObject({decision:'ACCEPTED',checkpointResolution:'RESOLVED'});
  expect(await store.list('candidates','feed-source-1')).toHaveLength(1);
  expect(await store.listPendingJobs('feed-source-1')).toMatchObject([{observationId:'observation-1',kind:'ACQUIRE'}]);
});
it('lost response retry through a fresh store returns the same durable terminal receipt',async()=>{
  const first=await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture());
  const again=await createCandidateIntakePort(new V1IntakeStore(ctx.db),testPolicy).acceptBatch(batchFixture());
  expect(again).toEqual(first); expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
});
it('immutable handoff and observation identities reject changed input without new effects',async()=>{
  const port=createCandidateIntakePort(store,testPolicy);await port.acceptBatch(batchFixture());
  const changed=batchFixture(); changed.coverage.safeCheckpointCursor='different';
  await expect(port.acceptBatch(changed)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const other=batchFixture();other.handoffId='other';other.observations[0].contentHash='b'.repeat(64);
  await expect(port.acceptBatch(other)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
});
it('property order and reordered batch rows do not change immutable request identity',async()=>{
  const port=createCandidateIntakePort(store,testPolicy), first=batchFixture();
  const result=await port.acceptBatch(first);
  const reversed=JSON.parse(JSON.stringify(first,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value));
  expect(await port.acceptBatch(reversed)).toEqual(result);
});
it('concurrent same handoff and different observations preserve one candidate and observation-bound jobs',async()=>{
  const port=createCandidateIntakePort(store,testPolicy);
  const same=await Promise.all([port.acceptBatch(batchFixture()),port.acceptBatch(batchFixture())]);
  expect(same[0]).toEqual(same[1]);
  await Promise.all([port.acceptBatch(batchFixture(2)),port.acceptBatch(batchFixture(3))]);
  expect(await store.list('candidates','feed-source-1')).toHaveLength(1);
  expect(await store.list('jobs','feed-source-1')).toHaveLength(3);
  expect(await store.list<IntakeReceipt>('intake_receipts','feed-source-1')).toHaveLength(3);
});
it.each([
  ['violation','other','REJECTED','RESOLVED'],['missing',undefined,'QUARANTINED','UNRESOLVED'],['matching','publisher','ACCEPTED','RESOLVED']
])('publisher restriction %s has a durable individual decision',async(_name,publisherId,decision,resolution)=>{
  await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{publisherIds:['publisher']}});
  const request=batchFixture();request.observations[0].publisherId=publisherId;
  const result=await createCandidateIntakePort(store,testPolicy).acceptBatch(request);
  expect(result.receipts[0]).toMatchObject({decision,checkpointResolution:resolution});
  expect((await store.listPendingJobs('feed-source-1')).filter(j=>j.kind==='ACQUIRE')).toHaveLength(decision==='ACCEPTED'?1:0);
});
it('missing account and date fields quarantine; explicit violation rejects even if another field is missing',async()=>{
  await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{startTime:'2026-10-02T00:00:00Z',accountIds:['owner']}});
  const port=createCandidateIntakePort(store,testPolicy);
  expect((await port.acceptBatch(batchFixture())).receipts[0].decision).toBe('QUARANTINED');
  const other=batchFixture(2);other.observations[0].publishedAtHint='2026-10-01T00:00:00Z';other.proposals[0].publishedAtHint=other.observations[0].publishedAtHint;
  expect((await port.acceptBatch(other)).receipts[0].decision).toBe('REJECTED');
});
it('already stale observations are ignored without acquisition',async()=>{
  await seedCurrentEvidence(store);
  expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture(9))).receipts[0]).toMatchObject({decision:'IGNORED',reasonCode:'IGNORED_STALE_OBSERVATION'});
  expect(await store.list('jobs','feed-source-1')).toHaveLength(0);
});
it('winning verified identical content advances ordering without revision or reassessment',async()=>{
  const {hash}=await seedCurrentEvidence(store);const request=batchFixture(12);request.observations[0].contentHash=hash;
  const policy={...testPolicy,verifySuppliedContent:async()=>({representation:'ARTICLE_EXCERPT' as const,contentCompleteness:'COMPLETE' as const,contentHash:hash})};
  expect((await createCandidateIntakePort(store,policy).acceptBatch(request)).receipts[0].decision).toBe('REPLAY');
  expect((await store.list<NormalizedEvidenceItem>('evidence','feed-source-1'))[0].currentFetchStartSequence).toBe(12);
  expect(await store.list('revisions','feed-source-1')).toHaveLength(1);expect(await store.list('jobs','feed-source-1')).toHaveLength(0);
  expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture(11))).receipts[0].decision).toBe('IGNORED');
});
it('ordered authoritative deletion bypasses acquisition and prevents stale resurrection',async()=>{
  await seedCurrentEvidence(store);const request=batchFixture(12);request.observations[0].operation='DELETE';request.observations[0].authoritativeCurrentState=true;delete request.observations[0].contentHash;delete request.observations[0].suppliedPayloadRef;request.proposals=[];
  const policy={...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(request.observations[0]),authoritativeReplacementAllowed:true})};
  expect((await createCandidateIntakePort(store,policy).acceptBatch(request)).receipts[0]).toMatchObject({decision:'DELETION_ACCEPTED',checkpointResolution:'RESOLVED'});
  expect(await store.listPendingJobs('feed-source-1')).toMatchObject([{kind:'REASSESS'}]);
  expect((await store.list<NormalizedEvidenceItem>('evidence','feed-source-1'))[0].state).toBe('DELETED');
  expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture(11))).receipts[0].decision).toBe('IGNORED');
});
it('DELETE lacking independent runtime verification is quarantined',async()=>{
  const request=batchFixture();request.observations[0].operation='DELETE';request.observations[0].authoritativeCurrentState=true;request.proposals=[];
  expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(request)).receipts[0].decision).toBe('QUARANTINED');
  expect(await store.list('tombstones','feed-source-1')).toHaveLength(0);
});
