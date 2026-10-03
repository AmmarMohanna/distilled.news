import {
  connectorHandoffRequestSchema, HandoffError, intakeReceiptSchema, timestampSchema,
  evidenceTombstoneSchema, normalizedEvidenceItemSchema, validateHandoffResponse,
  type CandidateIntakePort, type IntakeReceipt, type NormalizedEvidenceItem
} from '@distilled/contracts';
import { itemId, V1IntakeStore } from './store';
import { canonicalJson, canonicalRequest } from './canonical';
import { IntakeTransaction, transact } from './transaction';
import { currentEvidence, observationOrdering, representationDowngrade, validateQueryRestrictions } from './policy';
import type { AcceptedInput, CandidateRecord, DownstreamJob, IntakePolicy } from './types';

export function enqueue(tx:IntakeTransaction,input:AcceptedInput,kind:DownstreamJob['kind'],conflictId?:string) {
  const o=input.observation,id=JSON.stringify([kind,o.id,conflictId??'']);
  const job:DownstreamJob={id,feedId:o.feedId,feedSourceId:o.feedSourceId,observationId:o.id,kind,state:'PENDING',attempts:0,...(conflictId?{conflictId}:{})};
  tx.write('jobs',id,job,o.sourceItemKey,true);
}
async function decideIntake(tx:IntakeTransaction,input:AcceptedInput,policy:IntakePolicy,prior?:IntakeReceipt):Promise<IntakeReceipt> {
  const o=input.observation,now=timestampSchema.parse(policy.now());
  const id=itemId(o.feedSourceId,o.sourceItemKey),candidate=await tx.read<CandidateRecord>('candidates',id);
  const receipt:IntakeReceipt={id:prior?.id??crypto.randomUUID(),observationId:o.id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceItemKey:o.sourceItemKey,decision:'ACCEPTED',reasonCode:candidate?'ACCEPTED_NEW_OBSERVATION':'ACCEPTED_NEW_ITEM',checkpointResolution:'RESOLVED',decidedAt:now,intakePolicyVersion:policy.version};
  const set=(decision:IntakeReceipt['decision'],reasonCode:IntakeReceipt['reasonCode'])=>{receipt.decision=decision;receipt.reasonCode=reasonCode;receipt.checkpointResolution=decision==='QUARANTINED'?'UNRESOLVED':'RESOLVED'};
  const restriction=validateQueryRestrictions(tx.snapshot.scope,o,await policy.factsFor(o));
  if(restriction==='VIOLATION') set('REJECTED','REJECT_QUERY_RESTRICTION');
  else if(restriction==='UNVERIFIABLE') set('QUARANTINED','QUARANTINE_MISSING_VALIDATION_FIELDS');
  else {
    const current=await currentEvidence(tx,o),orderingPolicy=await policy.orderingFor(o);
    const authoritative=o.authoritativeCurrentState && orderingPolicy.authoritativeReplacementAllowed;
    const verified=o.operation==='UPSERT'?await policy.verifySuppliedContent(o):undefined;
    if(verified && (verified.contentHash!==o.contentHash || verified.representation!==o.representation || verified.contentCompleteness!==o.contentCompleteness)) throw new HandoffError('INVALID_REQUEST');
    const order=observationOrdering(o,current,verified?.contentHash,{...orderingPolicy,authoritativeReplacementAllowed:authoritative});
    if(order==='STALE') set('IGNORED','IGNORED_STALE_OBSERVATION');
    else if(order==='CONFLICT') set('QUARANTINED','QUARANTINE_REVISION_CONFLICT');
    else if(o.operation==='DELETE') {
      if(!authoritative) set('QUARANTINED','QUARANTINE_MISSING_VALIDATION_FIELDS');
      else {
        const tombstone=order==='REPLAY' && current?.item.currentTombstoneId ? await tx.read<{id:string}>('tombstones',current.item.currentTombstoneId) : evidenceTombstoneSchema.parse({id:crypto.randomUUID(),evidenceId:id,feedId:o.feedId,sourceObservationId:o.id,sourceRevision:o.sourceRevision,fetchStartSequence:o.fetchStartSequence,acceptedAt:now});
        if(!tombstone) throw new Error('V1_MISSING_TOMBSTONE');
        if(order!=='REPLAY') {
          tx.write('tombstones',tombstone.id,tombstone,o.sourceItemKey,true);
          const item:NormalizedEvidenceItem={id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId,sourceItemKey:o.sourceItemKey,state:'DELETED',currentTombstoneId:tombstone.id,currentObservationId:o.id,currentFetchStartSequence:o.fetchStartSequence,currentSourceRevision:o.sourceRevision,firstSeenAt:current?.item.firstSeenAt??now,updatedAt:now};
          tx.write('evidence',id,normalizedEvidenceItemSchema.parse(item),o.sourceItemKey);enqueue(tx,input,'REASSESS');
        }
        set('DELETION_ACCEPTED','ACCEPTED_DELETION');receipt.tombstoneId=tombstone.id;
      }
    } else if(!input.proposal) set('REJECTED','REJECT_UNSUPPORTED');
    else if(current?.revision && representationDowngrade(current.revision,verified??o) && !authoritative) set('QUARANTINED','QUARANTINE_REVISION_CONFLICT');
    else {
      receipt.candidateItemId=id;
      if(verified && current?.item.state==='ACTIVE' && verified.contentHash===current.revision?.contentHash) {
        set('REPLAY','REPLAY_IDENTICAL');
        if(order==='WIN') tx.write('evidence',id,{...current.item,currentObservationId:o.id,currentFetchStartSequence:o.fetchStartSequence,currentSourceRevision:o.sourceRevision,updatedAt:now},o.sourceItemKey);
      } else enqueue(tx,input,'ACQUIRE');
      // Pending acquisition does not establish accepted canonical evidence ordering.
      const latest=candidate?await tx.read<AcceptedInput>('inputs',candidate.latestObservationId):undefined;
      if(!candidate || !latest || o.fetchStartSequence>=latest.observation.fetchStartSequence) tx.write('candidates',id,{id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId,sourceItemKey:o.sourceItemKey,latestObservationId:o.id,discoveredAt:candidate?.discoveredAt??o.observedAt,intakePolicyVersion:policy.version} satisfies CandidateRecord,o.sourceItemKey);
    }
  }
  if(receipt.decision==='QUARANTINED') enqueue(tx,input,'AUTHORITATIVE_RECHECK');
  tx.write('intake_receipts',o.id,intakeReceiptSchema.parse(receipt),o.sourceItemKey);
  return receipt;
}
export interface DurableCandidateIntakePort extends CandidateIntakePort {
  resolveQuarantinedObservation(observationId:string,policy?:IntakePolicy):Promise<IntakeReceipt>;
}
export function createCandidateIntakePort(store:V1IntakeStore,policy:IntakePolicy):DurableCandidateIntakePort {
  return {
    async acceptBatch(input) {
      const parsed=connectorHandoffRequestSchema.safeParse(input);
      if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
      const request=parsed.data,canonical=canonicalRequest(request);
      return transact(store,request.coverage.feedSourceId,async tx=>{
        if(tx.snapshot.scope.feedId!==request.coverage.feedId || request.observations.some(o=>o.sourceId!==tx.snapshot.scope.sourceId)) throw new HandoffError('SCOPE_DENIED');
        const key=itemId(request.coverage.feedSourceId,request.handoffId),existing=await tx.read<{canonical:string}>('handoffs',key);
        if(existing && existing.canonical!==canonical) throw new HandoffError('IDEMPOTENCY_CONFLICT');
        if(!existing) tx.write('handoffs',key,{canonical},undefined,true);
        const receipts:IntakeReceipt[]=[];
        for(const o of request.observations) {
          const value:AcceptedInput={observation:o,proposal:request.proposals.find(p=>p.observationId===o.id)},stored=await tx.read<AcceptedInput>('inputs',o.id);
          if(stored && canonicalJson(stored)!==canonicalJson(value)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
          if(!stored) tx.write('inputs',o.id,value,o.sourceItemKey,true);
          const prior=await tx.read<IntakeReceipt>('intake_receipts',o.id);
          receipts.push(prior??await decideIntake(tx,value,policy));
        }
        return validateHandoffResponse(request,{contractVersion:request.contractVersion,handoffId:request.handoffId,durable:true,receipts});
      });
    },
    async resolveQuarantinedObservation(id,recheckPolicy=policy) {
      const stored=await store.read<AcceptedInput>('inputs',id);
      if(!stored) throw new HandoffError('INVALID_REQUEST');
      return transact(store,stored.feedSourceId,async tx=>{
        const input=await tx.read<AcceptedInput>('inputs',id),prior=await tx.read<IntakeReceipt>('intake_receipts',id);
        if(!input || !prior) throw new HandoffError('INVALID_REQUEST');
        return prior.decision==='QUARANTINED'?decideIntake(tx,input,recheckPolicy,prior):prior;
      });
    }
  };
}
