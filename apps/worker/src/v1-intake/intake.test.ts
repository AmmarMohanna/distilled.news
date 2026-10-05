import { beforeEach, afterEach, expect, it } from 'vitest';
import { handoffConnectorBatch, type IntakeReceipt, type NormalizedEvidenceItem } from '@distilled/contracts';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy, scopeFixture, seedCurrentEvidence } from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>, store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});
afterEach(async()=>ctx.dispose());
it('connector configuration revision is checked inside the durable acceptance transaction',async()=>{
 await expect(createCandidateIntakePort(store,{...testPolicy,expectedFeedRevision:2}).acceptBatch(batchFixture())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.list('intake_receipts','feed-source-1')).toHaveLength(0);
 expect(await store.listPendingJobs('feed-source-1')).toHaveLength(0);
});
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
it('quarantine resolution returns the newer receipt without rewriting terminal decisions',async()=>{
  await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{accountIds:['owner']}});
  const port=createCandidateIntakePort(store,testPolicy);
  const first=await port.acceptBatch(batchFixture());expect(first.receipts[0].decision).toBe('QUARANTINED');
  const verifiedPolicy={...testPolicy,factsFor:async()=>({accountId:'owner'})};
  const resolved=await port.resolveQuarantinedObservation('observation-1',verifiedPolicy);
  expect(resolved).toMatchObject({id:first.receipts[0].id,decision:'ACCEPTED',checkpointResolution:'RESOLVED'});
  expect((await port.acceptBatch(batchFixture())).receipts[0]).toEqual(resolved);
  expect(await port.resolveQuarantinedObservation('observation-1',testPolicy)).toEqual(resolved);
  expect((await store.listPendingJobs('feed-source-1')).map(j=>j.kind)).toEqual(['ACQUIRE']);
});
it('scope restrictions changing during validation invalidate the stale acceptance snapshot',async()=>{
  let changed=false;
  const policy={...testPolicy,factsFor:async()=>{if(!changed){changed=true;await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{publisherIds:['only-approved']}})}return {}}};
  const result=await createCandidateIntakePort(store,policy).acceptBatch(batchFixture());
  expect(result.receipts[0].decision).toBe('QUARANTINED');expect(await store.list('candidates','feed-source-1')).toHaveLength(0);
});
it('concurrent cross-scope reuse of an observation ID never commits mixed ownership',async()=>{
  await store.registerScope({...scopeFixture,feedId:'feed-2',feedSourceId:'feed-source-2',sourceId:'source-2'});
  const first=batchFixture(),second=batchFixture();
  second.coverage.feedId='feed-2';second.coverage.feedSourceId='feed-source-2';
  Object.assign(second.observations[0],{feedId:'feed-2',feedSourceId:'feed-source-2',sourceId:'source-2'});
  Object.assign(second.proposals[0],{feedId:'feed-2',feedSourceId:'feed-source-2',sourceId:'source-2'});
  const port=createCandidateIntakePort(store,testPolicy),results=await Promise.allSettled([port.acceptBatch(first),port.acceptBatch(second)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'IDEMPOTENCY_CONFLICT'}});
  const candidates=[...await store.list('candidates','feed-source-1'),...await store.list('candidates','feed-source-2')];expect(candidates).toHaveLength(1);
});
it('failed D1 job persistence rolls back the entire handoff including candidate and receipt',async()=>{
  await ctx.db.exec("CREATE TRIGGER fail_job BEFORE INSERT ON v1_jobs BEGIN SELECT RAISE(ABORT,'provider-private-diagnostic'); END;");
  await expect(createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture())).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE',message:'TEMPORARY_UNAVAILABLE'});
  for(const table of ['handoffs','inputs','candidates','intake_receipts','jobs'] as const) expect(await store.list(table,'feed-source-1')).toHaveLength(0);
});
it('one durable batch returns mixed accepted, rejected, quarantined and deleted receipts',async()=>{
  await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{publisherIds:['publisher']}});
  const request=batchFixture();request.observations[0].publisherId='publisher';
  for(const [id,publisher,operation] of [['reject','other','UPSERT'],['quarantine',undefined,'UPSERT'],['delete','publisher','DELETE']] as const) {
    const o={...request.observations[0],id,sourceItemKey:id,publisherId:publisher,operation,authoritativeCurrentState:operation==='DELETE'};
    request.observations.push(o);
    if(operation==='UPSERT') request.proposals.push({...request.proposals[0],observationId:id,sourceItemKey:id});
  }
  const policy={...testPolicy,orderingFor:async(o:typeof request.observations[0])=>({...await testPolicy.orderingFor(o),authoritativeReplacementAllowed:o.operation==='DELETE'})};
  const result=await handoffConnectorBatch(createCandidateIntakePort(store,policy),request);
  expect(result.receipts.map(r=>r.decision)).toEqual(['ACCEPTED','REJECTED','QUARANTINED','DELETION_ACCEPTED']);
  expect((await createCandidateIntakePort(new V1IntakeStore(ctx.db),policy).acceptBatch({...request,observations:[...request.observations].reverse(),proposals:[...request.proposals].reverse()})).receipts.map(r=>r.decision)).toEqual(['DELETION_ACCEPTED','QUARANTINED','REJECTED','ACCEPTED']);
  expect(await store.list('candidates','feed-source-1')).toHaveLength(1);
});
it('comparable revision beats fetch sequence; mixed revision metadata is quarantined',async()=>{
  const seeded=await seedCurrentEvidence(store);const revision={scheme:'provider_integer',value:'2',comparability:'COMPARABLE' as const,authority:'PROVIDER' as const};
  await store.commit(await store.snapshot('feed-source-1'),[{table:'evidence',id:seeded.evidence.id,itemKey:'guid-1',value:{...seeded.evidence,currentSourceRevision:revision}}]);
  const port=createCandidateIntakePort(store,testPolicy),older=batchFixture(12);older.observations[0].sourceRevision={...revision,value:'1'};
  expect((await port.acceptBatch(older)).receipts[0].decision).toBe('IGNORED');
  expect((await port.acceptBatch(batchFixture(13))).receipts[0].decision).toBe('QUARANTINED');
  const newer=batchFixture(9);newer.observations[0].sourceRevision={...revision,value:'3'};
  expect((await port.acceptBatch(newer)).receipts[0].decision).toBe('ACCEPTED');
});
