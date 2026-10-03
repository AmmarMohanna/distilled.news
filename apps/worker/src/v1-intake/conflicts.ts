import { HandoffError, decideObservationOrdering, evidenceRevisionConflictSchema, timestampSchema, type EvidenceRevisionConflict, type EvidenceAcceptanceReceipt, type IntakeReceipt } from '@distilled/contracts';
import type { V1IntakeStore } from './store';
import { transact } from './transaction';
import { currentEvidence } from './policy';
import type { AcceptedInput, DownstreamJob, IntakePolicy } from './types';
export type ConflictResolution = {kind:'KEEP_CURRENT';authoritativeObservationId:string}|{kind:'LATER_OBSERVATION';observationId:string};
export async function resolveEvidenceConflict(store:V1IntakeStore,id:string,resolution:ConflictResolution,policy:IntakePolicy):Promise<EvidenceRevisionConflict> {
  const row=await store.read<EvidenceRevisionConflict>('conflicts',id);
  if(!row) throw new HandoffError('INVALID_REQUEST');
  return transact(store,row.feedSourceId,async tx=>{
    const conflict=await tx.read<EvidenceRevisionConflict>('conflicts',id);
    if(!conflict) throw new HandoffError('INVALID_REQUEST');
    const observationId=resolution.kind==='KEEP_CURRENT'?resolution.authoritativeObservationId:resolution.observationId;
    const state=resolution.kind==='KEEP_CURRENT'?'RESOLVED_KEEP_CURRENT':'RESOLVED_BY_LATER_OBSERVATION';
    if(conflict.state!=='PENDING_AUTHORITATIVE_RECHECK') {
      if(conflict.state!==state || conflict.resolutionObservationId!==observationId) throw new HandoffError('IDEMPOTENCY_CONFLICT');
      return conflict;
    }
    const original=await tx.read<AcceptedInput>('inputs',conflict.sourceObservationId),recheck=await tx.read<AcceptedInput>('inputs',observationId);
    const receipt=await tx.read<IntakeReceipt>('intake_receipts',observationId),acceptance=await tx.read<EvidenceAcceptanceReceipt>('evidence_receipts',observationId);
    if(!original || !recheck || recheck.observation.sourceItemKey!==original.observation.sourceItemKey || !receipt || !['ACCEPTED','REPLAY','DELETION_ACCEPTED'].includes(receipt.decision)) throw new HandoffError('INVALID_REQUEST');
    const current=await currentEvidence(tx,original.observation);
    if(!current) throw new HandoffError('INVALID_REQUEST');
    const order=await policy.orderingFor(recheck.observation);
    if(resolution.kind==='KEEP_CURRENT') {
      if(!recheck.observation.authoritativeCurrentState || !order.authoritativeReplacementAllowed || !current.revision) throw new HandoffError('INVALID_REQUEST');
      const verified=await policy.verifySuppliedContent(recheck.observation);
      const suppliedReplay=receipt.decision==='REPLAY' && verified?.contentHash===current.revision.contentHash && verified?.contentHash===recheck.observation.contentHash;
      const acquiredReplay=acceptance?.decision==='REPLAY_CURRENT_CONTENT' && acceptance.resultingRevisionId===current.revision.id;
      if(!suppliedReplay && !acquiredReplay) throw new HandoffError('INVALID_REQUEST');
    } else {
      if(current.item.currentObservationId!==observationId) throw new HandoffError('INVALID_REQUEST');
      const incoming=current.ordering,originalOrder={operation:original.observation.operation,fetchStartSequence:original.observation.fetchStartSequence,sourceRevision:original.observation.sourceRevision,contentHash:conflict.incomingContentHash};
      if(decideObservationOrdering(originalOrder,incoming,{...order,authoritativeReplacementAllowed:recheck.observation.authoritativeCurrentState && order.authoritativeReplacementAllowed})!=='WIN') throw new HandoffError('INVALID_REQUEST');
    }
    const result=evidenceRevisionConflictSchema.parse({...conflict,state,resolutionObservationId:observationId,resolvedAt:timestampSchema.parse(policy.now())});
    tx.write('conflicts',id,result,original.observation.sourceItemKey);
    const jobId=JSON.stringify(['AUTHORITATIVE_RECHECK',conflict.sourceObservationId,id]),job=await tx.read<DownstreamJob>('jobs',jobId);
    if(job) tx.write('jobs',jobId,{...job,state:'DONE'},original.observation.sourceItemKey);
    return result;
  });
}
/** Failed recheck calls are bounded; exhausting retries never resolves the conflict. */
export async function recordRecheckFailure(store:V1IntakeStore,jobId:string,now:string):Promise<void> {
  timestampSchema.parse(now);
  const row=await store.read<DownstreamJob>('jobs',jobId);
  if(!row || row.value.kind!=='AUTHORITATIVE_RECHECK') throw new HandoffError('INVALID_REQUEST');
  await transact(store,row.feedSourceId,async tx=>{
    const job=await tx.read<DownstreamJob>('jobs',jobId);
    if(!job || job.state==='DONE' || job.exhausted) return;
    const attempts=job.attempts+1;
    tx.write('jobs',jobId,{...job,state:'PENDING',attempts,exhausted:attempts>=5,nextAttemptAt:new Date(Date.parse(now)+60_000*2**(attempts-1)).toISOString()});
  });
}
