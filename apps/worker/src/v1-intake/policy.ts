import { decideObservationOrdering, type EvidenceRevision, type NormalizedEvidenceItem, type OrderingPolicy, type OrderingState, type SourceObservation, type ContentCompleteness, type RepresentationKind } from '@distilled/contracts';
import { itemId } from './store';
import type { IntakeTransaction } from './transaction';
import type { IntakeScope, ValidationFacts } from './types';

export function validateQueryRestrictions(scope:IntakeScope,o:SourceObservation,facts:ValidationFacts):'MATCH'|'VIOLATION'|'UNVERIFIABLE' {
  const r=scope.restrictions;let missing=false,violation=false;
  for(const [allowed,value] of [[r.publisherIds,o.publisherId],[r.accountIds,facts.accountId]] as const) {
    if(allowed) { if(value===undefined) missing=true;else if(!allowed.includes(value)) violation=true }
  }
  if(r.startTime || r.endTime) {
    if(!o.publishedAtHint) missing=true;
    else if((r.startTime && Date.parse(o.publishedAtHint)<Date.parse(r.startTime)) || (r.endTime && Date.parse(o.publishedAtHint)>=Date.parse(r.endTime))) violation=true;
  }
  return violation?'VIOLATION':missing?'UNVERIFIABLE':'MATCH';
}
export interface CurrentEvidence { item:NormalizedEvidenceItem; revision?:EvidenceRevision; ordering:OrderingState }
export async function currentEvidence(tx:IntakeTransaction,o:SourceObservation):Promise<CurrentEvidence|undefined> {
  const item=await tx.read<NormalizedEvidenceItem>('evidence',itemId(o.feedSourceId,o.sourceItemKey));
  if(!item) return undefined;
  const revision=item.currentRevisionId?await tx.read<EvidenceRevision>('revisions',item.currentRevisionId):undefined;
  if(item.state==='ACTIVE' && !revision) throw new Error('V1_MISSING_CURRENT_REVISION');
  return {item,revision,ordering:{operation:item.state==='ACTIVE'?'UPSERT':'DELETE',fetchStartSequence:item.currentFetchStartSequence,sourceRevision:item.currentSourceRevision,contentHash:revision?.contentHash}};
}
export function observationOrdering(o:SourceObservation,current:CurrentEvidence|undefined,hash:string|undefined,policy:OrderingPolicy) {
  // Unknown bytes at intake defer equal-revision content adjudication to extraction.
  // The placeholder establishes compatible ordering only, never content replay.
  const contentHash=hash??(o.operation==='UPSERT'?current?.ordering.contentHash:undefined);
  return decideObservationOrdering(current?.ordering,{operation:o.operation,fetchStartSequence:o.fetchStartSequence,sourceRevision:o.sourceRevision,contentHash},policy);
}
export function representationDowngrade(current:{representation:RepresentationKind;contentCompleteness:ContentCompleteness},incoming:{representation:RepresentationKind;contentCompleteness:ContentCompleteness}):boolean {
  const completeness={UNKNOWN:0,PARTIAL:1,COMPLETE:2};
  if(current.representation===incoming.representation) return completeness[incoming.contentCompleteness]<completeness[current.contentCompleteness];
  const article:Partial<Record<RepresentationKind,number>>={FULL_ARTICLE:3,ARTICLE_EXCERPT:2,LISTING_RESULT:1};
  const a=article[current.representation],b=article[incoming.representation];
  return a===undefined || b===undefined || b<a;
}
