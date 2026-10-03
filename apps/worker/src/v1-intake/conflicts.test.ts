import { beforeEach, afterEach, expect, it } from 'vitest';
import { hashContent, type EvidenceRevisionConflict, type IntakeReceipt, type EvidenceRevision } from '@distilled/contracts';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { acceptAcquiredContent } from './evidence';
import { resolveEvidenceConflict, recordRecheckFailure } from './conflicts';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy } from './test-utils';
import type { AcceptedAcquiredContent } from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});
afterEach(async()=>ctx.dispose());
function versionedRequest(sequence:number,revision='2') {
  const request=batchFixture(sequence);request.observations[0].sourceRevision={scheme:'provider_integer',value:revision,comparability:'COMPARABLE',authority:'PROVIDER'};return request;
}
function content(sequence:number,body:string,candidateId:string):AcceptedAcquiredContent { return {id:`content-${sequence}`,feedId:'feed-1',candidateId,sourceObservationId:`observation-${sequence}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,acquiredAt:testPolicy.now(),acquisitionMethod:'supplied_payload'} }
async function pendingConflict() {
  const port=createCandidateIntakePort(store,testPolicy);
  const a=await port.acceptBatch(versionedRequest(1)),b=await port.acceptBatch(versionedRequest(2));
  await acceptAcquiredContent(store,content(1,'A',a.receipts[0].candidateItemId!),testPolicy);
  const conflict=await acceptAcquiredContent(store,content(2,'B',b.receipts[0].candidateItemId!),testPolicy);
  return conflict.conflictId!;
}
it('equal comparable revision conflict keeps original intake resolved and one explicit pending recheck',async()=>{
  const id=await pendingConflict();
  expect((await store.read<EvidenceRevisionConflict>('conflicts',id))?.value).toMatchObject({state:'PENDING_AUTHORITATIVE_RECHECK',reason:'EQUAL_COMPARABLE_SOURCE_REVISION_DIFFERENT_STATE'});
  expect((await store.read<IntakeReceipt>('intake_receipts','observation-2'))?.value.checkpointResolution).toBe('RESOLVED');
  expect((await store.listPendingJobs('feed-source-1')).filter(j=>j.kind==='AUTHORITATIVE_RECHECK')).toHaveLength(1);
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.body)).toEqual(['A']);
});
it('failed bounded rechecks remain unresolved and exhausted work does not auto-loop',async()=>{
  const id=await pendingConflict(),job=(await store.listPendingJobs('feed-source-1')).find(j=>j.conflictId===id)!;
  for(let i=0;i<7;i++) await recordRecheckFailure(store,job.id,'2026-10-03T12:00:00Z');
  expect((await store.read<{attempts:number;exhausted:boolean;nextAttemptAt:string}>('jobs',job.id))?.value).toMatchObject({attempts:5,exhausted:true,nextAttemptAt:'2026-10-03T12:16:00.000Z'});
  expect((await store.read<EvidenceRevisionConflict>('conflicts',id))?.value.state).toBe('PENDING_AUTHORITATIVE_RECHECK');
  expect((await store.listPendingJobs('feed-source-1')).filter(j=>j.conflictId===id)).toHaveLength(0);
});
it('later strictly ordered accepted content durably resolves a conflict and its recheck job',async()=>{
  const id=await pendingConflict(),next=await createCandidateIntakePort(store,testPolicy).acceptBatch(versionedRequest(3,'3'));
  await acceptAcquiredContent(store,content(3,'C',next.receipts[0].candidateItemId!),testPolicy);
  const result=await resolveEvidenceConflict(new V1IntakeStore(ctx.db),id,{kind:'LATER_OBSERVATION',observationId:'observation-3'},testPolicy);
  expect(result).toMatchObject({state:'RESOLVED_BY_LATER_OBSERVATION',resolutionObservationId:'observation-3'});
  expect((await store.listPendingJobs('feed-source-1')).filter(j=>j.conflictId===id)).toHaveLength(0);
});
it('trusted authoritative recheck can keep verified current content without accepting the conflicting completion',async()=>{
  const id=await pendingConflict(),request=versionedRequest(3),hash=await hashContent({representation:'ARTICLE_EXCERPT',body:'A'});
  request.observations[0].authoritativeCurrentState=true;request.observations[0].contentHash=hash;
  const policy={...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(request.observations[0]),authoritativeReplacementAllowed:true}),verifySuppliedContent:async()=>({representation:'ARTICLE_EXCERPT' as const,contentCompleteness:'COMPLETE' as const,contentHash:hash})};
  expect((await createCandidateIntakePort(store,policy).acceptBatch(request)).receipts[0].decision).toBe('REPLAY');
  expect((await resolveEvidenceConflict(store,id,{kind:'KEEP_CURRENT',authoritativeObservationId:'observation-3'},policy)).state).toBe('RESOLVED_KEEP_CURRENT');
  expect((await store.list<EvidenceRevision>('revisions','feed-source-1')).map(r=>r.body)).toEqual(['A']);
});
it('arbitrary IDs and conflicting completions cannot resolve a pending conflict',async()=>{
  const id=await pendingConflict();
  await expect(resolveEvidenceConflict(store,id,{kind:'KEEP_CURRENT',authoritativeObservationId:'invented'},testPolicy)).rejects.toMatchObject({code:'INVALID_REQUEST'});
  await expect(resolveEvidenceConflict(store,id,{kind:'LATER_OBSERVATION',observationId:'observation-2'},testPolicy)).rejects.toMatchObject({code:'INVALID_REQUEST'});
  expect((await store.read<EvidenceRevisionConflict>('conflicts',id))?.value.state).toBe('PENDING_AUTHORITATIVE_RECHECK');
});
