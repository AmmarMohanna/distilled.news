import { beforeEach, afterEach, expect, it } from 'vitest';
import { hashContent, type EvidenceRevision, type NormalizedEvidenceItem } from '@distilled/contracts';
import { V1IntakeStore, itemId } from './store';
import { createCandidateIntakePort } from './intake';
import { acceptAcquiredContent } from './evidence';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy, scopeFixture } from './test-utils';
import type { AcceptedAcquiredContent } from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});
afterEach(async()=>ctx.dispose());
async function acquire(sequence:number,body:string):Promise<AcceptedAcquiredContent> {
  const result=await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture(sequence));
  return {id:`acquired-${sequence}`,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:`observation-${sequence}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'};
}
it('A -> B -> A creates three immutable revisions and preserves exact provenance',async()=>{
  for(const [sequence,body] of [[1,'A'],[2,'B'],[3,'A']] as const) expect((await acceptAcquiredContent(store,await acquire(sequence,body),testPolicy)).decision).toBe('PROMOTED_NEW_REVISION');
  const revisions=(await store.list<EvidenceRevision>('revisions','feed-source-1')).sort((a,b)=>a.revision-b.revision);
  expect(revisions.map(r=>[r.revision,r.body,r.sourceObservationId,r.acquiredContentId])).toEqual([[1,'A','observation-1','acquired-1'],[2,'B','observation-2','acquired-2'],[3,'A','observation-3','acquired-3']]);
  expect(revisions[0].contentHash).toBe(revisions[2].contentHash);
  expect((await store.read<NormalizedEvidenceItem>('evidence',itemId('feed-source-1','guid-1')))?.value.currentRevisionId).toBe(revisions[2].id);
});
it('delayed earlier acquisition cannot overwrite a later promoted result',async()=>{
  const earlier=await acquire(11,'old'),later=await acquire(12,'new');
  await acceptAcquiredContent(store,later,testPolicy);
  expect((await acceptAcquiredContent(new V1IntakeStore(ctx.db),earlier,testPolicy)).decision).toBe('IGNORED_STALE_OBSERVATION');
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.body)).toEqual(['new']);
});
it('same acquired result replays exactly once; changed immutable bytes fail',async()=>{
  const content=await acquire(1,'A'),first=await acceptAcquiredContent(store,content,testPolicy);
  expect(await acceptAcquiredContent(new V1IntakeStore(ctx.db),content,testPolicy)).toEqual(first);
  await expect(acceptAcquiredContent(store,{...content,body:'altered'},testPolicy)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
});
it('winning identical content advances ordering but emits no new revision or reassessment',async()=>{
  await acceptAcquiredContent(store,await acquire(10,'A'),testPolicy);
  const old=await acquire(11,'B'),same=await acquire(12,'A');
  expect((await acceptAcquiredContent(store,same,testPolicy)).decision).toBe('REPLAY_CURRENT_CONTENT');
  expect((await acceptAcquiredContent(store,old,testPolicy)).decision).toBe('IGNORED_STALE_OBSERVATION');
  expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
  expect((await store.listPendingJobs('feed-source-1')).filter(j=>j.kind==='REASSESS')).toHaveLength(1);
  expect((await store.list<NormalizedEvidenceItem>('evidence','feed-source-1'))[0].currentFetchStartSequence).toBe(12);
});
it('scope deletion during extraction prevents promotion and leaves retry state durable',async()=>{
  const content=await acquire(1,'A');await store.registerScope({...scopeFixture,deletedAt:testPolicy.now()});
  await expect(acceptAcquiredContent(store,content,testPolicy)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
  expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
});
it('recomputes acquired hashes and rejects cross-feed/candidate/observation binding',async()=>{
  const content=await acquire(1,'Real extracted content');
  await expect(acceptAcquiredContent(store,{...content,feedId:'other'},testPolicy)).rejects.toMatchObject({code:'SCOPE_DENIED'});
  await expect(acceptAcquiredContent(store,{...content,candidateId:'other'},testPolicy)).rejects.toMatchObject({code:'INVALID_REQUEST'});
  await acceptAcquiredContent(store,content,testPolicy);
  const revision=(await store.list<EvidenceRevision>('revisions','feed-source-1'))[0];
  expect(revision.contentHash).toBe(await hashContent({representation:'ARTICLE_EXCERPT',body:'Real extracted content'}));
  expect(revision.contentHash).not.toBe('a'.repeat(64));
});
it('concurrent same result returns one receipt and one immutable revision',async()=>{
  const content=await acquire(1,'A');const result=await Promise.all([acceptAcquiredContent(store,content,testPolicy),acceptAcquiredContent(store,content,testPolicy)]);
  expect(result[0]).toEqual(result[1]);expect(await store.list('revisions','feed-source-1')).toHaveLength(1);expect(await store.list('evidence_receipts','feed-source-1')).toHaveLength(1);
});
it('genuinely newer UPSERT after deletion reactivates evidence with the next historical revision',async()=>{
  await acceptAcquiredContent(store,await acquire(1,'A'),testPolicy);
  const deleted=batchFixture(2);deleted.observations[0].operation='DELETE';deleted.observations[0].authoritativeCurrentState=true;deleted.proposals=[];
  const policy={...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(deleted.observations[0]),authoritativeReplacementAllowed:true})};
  await createCandidateIntakePort(store,policy).acceptBatch(deleted);
  expect((await acceptAcquiredContent(store,await acquire(3,'B'),testPolicy)).decision).toBe('PROMOTED_NEW_REVISION');
  expect((await store.list<NormalizedEvidenceItem>('evidence','feed-source-1'))[0]).toMatchObject({state:'ACTIVE',currentFetchStartSequence:3});
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.revision).sort()).toEqual([1,2]);
  expect(await store.list('tombstones','feed-source-1')).toHaveLength(1);
});
it('lower completeness is quarantined at promotion rather than overwriting richer evidence',async()=>{
  const first=await acquire(1,'rich'),second=await acquire(2,'fragment');
  await acceptAcquiredContent(store,first,testPolicy);
  expect((await acceptAcquiredContent(store,{...second,contentCompleteness:'PARTIAL'},testPolicy)).decision).toBe('QUARANTINED_REVISION_CONFLICT');
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.body)).toEqual(['rich']);
});
it('equal fallback sequence with different extracted content stays explicitly conflicted',async()=>{
  const first=await acquire(1,'A'),request=batchFixture(1);request.handoffId='same-sequence-other-observation';request.observations[0].id='observation-2';request.proposals[0].observationId='observation-2';
  const second=await createCandidateIntakePort(store,testPolicy).acceptBatch(request);
  await acceptAcquiredContent(store,first,testPolicy);
  const result=await acceptAcquiredContent(store,{...first,id:'acquired-2',sourceObservationId:'observation-2',candidateId:second.receipts[0].candidateItemId!,body:'B'},testPolicy);
  expect(result.decision).toBe('QUARANTINED_REVISION_CONFLICT');
  expect((await store.read<{reason:string}>('conflicts',result.conflictId!))?.value.reason).toBe('EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE');
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.body)).toEqual(['A']);
});
it.each(['ARTICLE_EXCERPT','TELEGRAM_MESSAGE','LISTING_RESULT'] as const)('accepts usable %s evidence without relabeling it as a full article',async representation=>{
  const request=batchFixture();request.observations[0].representation=representation;request.proposals[0].representation=representation;
  const intake=await createCandidateIntakePort(store,testPolicy).acceptBatch(request);
  await acceptAcquiredContent(store,{id:'content',feedId:'feed-1',candidateId:intake.receipts[0].candidateItemId!,sourceObservationId:'observation-1',representation,contentCompleteness:'COMPLETE',body:'Usable source content',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1'))[0].representation).toBe(representation);
});
it('empty listing does not infer deletion or change current evidence',async()=>{
  await acceptAcquiredContent(store,await acquire(1,'A'),testPolicy);
  const before=await store.list('evidence','feed-source-1'),request=batchFixture(2);request.observations=[];request.proposals=[];
  expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(request)).receipts).toEqual([]);
  expect(await store.list('evidence','feed-source-1')).toEqual(before);expect(await store.list('tombstones','feed-source-1')).toHaveLength(0);
});
