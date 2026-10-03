import {
  HandoffError, hashContent, idSchema, timestampSchema, representationSchema, completenessSchema,
  evidenceRevisionSchema, normalizedEvidenceItemSchema, evidenceAcceptanceReceiptSchema, evidenceRevisionConflictSchema,
  type EvidenceAcceptanceReceipt, type EvidenceRevisionConflict, type IntakeReceipt
} from '@distilled/contracts';
import { z } from 'zod';
import { itemId, V1IntakeStore } from './store';
import { canonicalJson } from './canonical';
import { transact } from './transaction';
import { currentEvidence, observationOrdering, representationDowngrade, validateQueryRestrictions, type CurrentEvidence } from './policy';
import { enqueue } from './intake';
import { requireAcquisitionLease } from './acquisition-lease';
import type { AcceptedAcquiredContent, AcceptedInput, DownstreamJob, IntakePolicy } from './types';

export const acquiredSchema=z.object({id:idSchema,feedId:idSchema,candidateId:idSchema,sourceObservationId:idSchema,representation:representationSchema,contentCompleteness:completenessSchema,title:z.string().optional(),body:z.string().max(512000).refine(s=>s.trim().length>0),language:idSchema.optional(),publishedAt:timestampSchema.optional(),canonicalUrl:z.string().url().refine(s=>{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}).optional(),acquiredAt:timestampSchema,acquisitionMethod:z.enum(['supplied_payload','platform_api','direct_http','browser']),acquisitionProvider:idSchema.optional(),sourceId:idSchema.optional(),resolvedUrl:z.string().url().optional(),quality:z.object({transportSuccess:z.literal(true),extractionSuccess:z.literal(true),extractionComplete:z.boolean()}).strict().optional(),provenance:z.object({routerVersion:idSchema,stages:z.array(idSchema).max(5),rawPayloadRef:idSchema.optional(),browserEvidence:z.object({acceptanceId:idSchema.optional(),observationId:idSchema.optional(),rawArtifactRef:idSchema.optional()}).strict().optional()}).strict().optional()}).strict();

function conflictReason(input:AcceptedInput,current:CurrentEvidence|undefined):EvidenceRevisionConflict['reason'] {
  const a=input.observation.sourceRevision,b=current?.item.currentSourceRevision;
  if(a?.comparability==='COMPARABLE' && b?.comparability==='COMPARABLE' && a.scheme===b.scheme && a.authority===b.authority && a.value===b.value) return 'EQUAL_COMPARABLE_SOURCE_REVISION_DIFFERENT_STATE';
  if(!a || a.comparability==='OPAQUE') {if(!b || b.comparability==='OPAQUE') return 'EQUAL_FETCH_SEQUENCE_DIFFERENT_STATE'}
  return 'INCOMPARABLE_REVISION_REQUIRES_AUTHORITATIVE_CHECK';
}

export async function acceptAcquiredContent(store:V1IntakeStore,raw:AcceptedAcquiredContent,policy:IntakePolicy,lease?:{jobId:string;token:string}):Promise<EvidenceAcceptanceReceipt> {
  const parsed=acquiredSchema.safeParse(raw);
  if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
  const content=parsed.data,stored=await store.read<AcceptedInput>('inputs',content.sourceObservationId);
  if(!stored) throw new HandoffError('INVALID_REQUEST');
  const hash=await hashContent({representation:content.representation,title:content.title,body:content.body});
  return transact(store,stored.feedSourceId,async tx=>{
    const input=await tx.read<AcceptedInput>('inputs',content.sourceObservationId),intake=await tx.read<IntakeReceipt>('intake_receipts',content.sourceObservationId);
    if(!input || !intake || intake.decision!=='ACCEPTED' || intake.candidateItemId!==content.candidateId) throw new HandoffError('INVALID_REQUEST');
    const o=input.observation,id=itemId(o.feedSourceId,o.sourceItemKey),now=timestampSchema.parse(policy.now());
    if(content.feedId!==o.feedId || o.feedId!==tx.snapshot.scope.feedId || o.sourceId!==tx.snapshot.scope.sourceId || (content.sourceId && content.sourceId!==o.sourceId)) throw new HandoffError('SCOPE_DENIED');
    if(lease) {
      if(lease.jobId!==JSON.stringify(['ACQUIRE',o.id,''])) throw new HandoffError('INVALID_REQUEST');
      await requireAcquisitionLease(tx,lease.jobId,lease.token,now);
    }
    if(validateQueryRestrictions(tx.snapshot.scope,o,await policy.factsFor(o))!=='MATCH') throw new HandoffError('SCOPE_DENIED');
    const previous=await tx.read<AcceptedAcquiredContent>('acquired',content.id);
    if(previous && canonicalJson(previous)!==canonicalJson(content)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
    const prior=await tx.read<EvidenceAcceptanceReceipt>('evidence_receipts',o.id);
    if(prior) { if(prior.acquiredContentId!==content.id || !previous) throw new HandoffError('IDEMPOTENCY_CONFLICT'); return prior }
    tx.write('acquired',content.id,content,o.sourceItemKey,true);
    const current=await currentEvidence(tx,o),orderingPolicy=await policy.orderingFor(o);
    const authoritative=o.authoritativeCurrentState && orderingPolicy.authoritativeReplacementAllowed;
    const order=observationOrdering(o,current,hash,{...orderingPolicy,authoritativeReplacementAllowed:authoritative});
    const downgraded=current?.revision && representationDowngrade(current.revision,content) && !authoritative;
    const receipt:EvidenceAcceptanceReceipt={id:crypto.randomUUID(),evidenceId:id,sourceObservationId:o.id,acquiredContentId:content.id,decision:'PROMOTED_NEW_REVISION',decidedAt:now};
    if(order==='STALE') receipt.decision='IGNORED_STALE_OBSERVATION';
    else if(order==='CONFLICT' || downgraded) {
      const conflict=evidenceRevisionConflictSchema.parse({id:crypto.randomUUID(),evidenceId:id,sourceObservationId:o.id,acquiredContentId:content.id,currentRevisionId:current?.item.currentRevisionId,currentTombstoneId:current?.item.currentTombstoneId,incomingContentHash:hash,currentContentHash:current?.revision?.contentHash,reason:conflictReason(input,current),state:'PENDING_AUTHORITATIVE_RECHECK',createdAt:now});
      receipt.decision='QUARANTINED_REVISION_CONFLICT';receipt.conflictId=conflict.id;
      tx.write('conflicts',conflict.id,conflict,o.sourceItemKey);enqueue(tx,input,'AUTHORITATIVE_RECHECK',conflict.id);
    } else {
      if(current?.item.state==='ACTIVE' && current.revision?.contentHash===hash) {
        receipt.decision='REPLAY_CURRENT_CONTENT';receipt.resultingRevisionId=current.revision.id;
      } else {
        // Tombstones clear the current pointer but do not reset historical revision numbering.
        const revisions=await store.list<{evidenceId:string;revision:number}>('revisions',o.feedSourceId);
        const revision=Math.max(0,...revisions.filter(r=>r.evidenceId===id).map(r=>r.revision))+1;
        const value=evidenceRevisionSchema.parse({id:crypto.randomUUID(),evidenceId:id,feedId:o.feedId,revision,sourceObservationId:o.id,acquiredContentId:content.id,canonicalUrl:content.canonicalUrl??o.canonicalUrl,title:content.title,body:content.body,language:content.language,publishedAt:content.publishedAt,representation:content.representation,contentCompleteness:content.contentCompleteness,contentHash:hash,sourceRevision:o.sourceRevision,fetchStartSequence:o.fetchStartSequence,acceptedAt:now});
        receipt.resultingRevisionId=value.id;tx.write('revisions',value.id,value,o.sourceItemKey,true);enqueue(tx,input,'REASSESS');
      }
      if(order==='WIN' || !current) {
        const item=normalizedEvidenceItemSchema.parse({id,feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId,sourceItemKey:o.sourceItemKey,state:'ACTIVE',currentRevisionId:receipt.resultingRevisionId,currentObservationId:o.id,currentFetchStartSequence:o.fetchStartSequence,currentSourceRevision:o.sourceRevision,firstSeenAt:current?.item.firstSeenAt??now,updatedAt:now});
        tx.write('evidence',id,item,o.sourceItemKey);
      }
    }
    const result=evidenceAcceptanceReceiptSchema.parse(receipt);
    tx.write('evidence_receipts',o.id,result,o.sourceItemKey,true);
    const jobId=JSON.stringify(['ACQUIRE',o.id,'']),job=await tx.read<DownstreamJob>('jobs',jobId);
    if(job) tx.write('jobs',jobId,{...job,state:'DONE',leaseToken:undefined,leaseUntil:undefined},o.sourceItemKey);
    return result;
  });
}
export { resolveEvidenceConflict } from './conflicts';
