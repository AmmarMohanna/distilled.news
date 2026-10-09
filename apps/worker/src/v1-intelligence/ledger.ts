import {equivalentFact} from './editorial';
import type {EditorialWork} from './editorial-work';
import {provenMaterialDelta} from './material-delta';
import {revisionChangesMeaning,changedCommunicatedSpans} from './correction-materiality';
import {HandoffError,sha256,type BriefingCandidate,type EventVersion} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore,type FeedTransaction,type DocumentKind} from './store';
import type {BriefingEditionRecord} from './publication';
import type {PublicationStatus} from './public-read';
import type {SelectionRecord} from './scoring';
import type {StorylineVersion} from './types';
import {extractClaimMentions,type ClaimMention} from './claims';
import type {Proposition} from './semantic-state';
import type {EditorialPlanRecord} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';

export const LEDGER_POLICY='grounded-communication-ledger-v1';
export interface LedgerEntry {
 id:string;feedId:string;editionId:string;claimId:string;candidateId:string;claimText:string;claimFacts:string[];
 claimMentionIds:string[];propositionIds:string[];eventIds:string[];storylineIds:string[];
 targetType:'EVENT'|'STORYLINE';targetVersionId:string;evidenceRevisionIds:string[];
 certainty:{kind:string;hedges:string[]};attribution?:string;communicatedAt:string;policyVersion:string;
}
export type CorrectionKind='CONTRADICTED'|'CORRECTED'|'RETRACTED'|'SOURCE_REVISED'|'SOURCE_DELETED';
export interface CorrectionObligation {id:string;feedId:string;ledgerEntryId:string;editionId:string;kind:CorrectionKind;triggerId:string;state:'OPEN';createdAt:string;policyVersion:string;publicationWithdrawal?:{reason:string}}
export interface LedgerProjection {id:string;feedId:string;editionId:string;entryIds:string[];policyVersion:string}
export const ledgerProjectionId=(editionId:string)=>JSON.stringify([editionId,LEDGER_POLICY]);
const facts=(text:string)=>text.normalize('NFKC').trim().split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u).map(s=>s.trim()).filter(Boolean);
const literal=(text:string,fact:string)=>text.normalize('NFKC').replace(/\s+/g,' ').includes(fact.normalize('NFKC').replace(/\s+/g,' '));
export function communicatedCertainty(mentions:ClaimMention[]):LedgerEntry['certainty'] {
 const kinds=[...new Set(mentions.map(m=>m.certainty.kind))];
 return {kind:kinds.length>1?'MIXED':kinds[0]??'UNSPECIFIED',hedges:[...new Set(mentions.flatMap(m=>m.certainty.hedges))]};
}

/** Reuse a settled semantic same-Event corroboration judgment. Revision IDs
 * alone prove no correction, and unresolved/provisional judgments prove no equivalence. */
async function semanticallyUnchangedRevision(store:V1FeedStore,feedId:string,entry:LedgerEntry,revisionId:string,tx?:FeedTransaction):Promise<boolean>{
 const roots=tx?await tx.list<import('./types').EventRecord>('events'):await store.list<import('./types').EventRecord>(feedId,'events'),members=tx?await tx.list<import('@distilled/contracts').EventMembership>('memberships'):await store.list<import('@distilled/contracts').EventMembership>(feedId,'memberships');
 const current=roots.filter(r=>members.some(m=>m.eventVersionId===r.currentVersionId&&m.evidenceRevisionId===revisionId));if(!current.length)return false;
 for(const root of current){const state=tx?await tx.read<import('./semantic-state').EventSemanticState>('event_semantic_states',root.currentVersionId):await store.read<import('./semantic-state').EventSemanticState>(feedId,'event_semantic_states',root.currentVersionId);
  if(!entry.eventIds.includes(root.id)||!state||state.provisional||state.structuralRelation!=='SAME_EVENT'||!['GPT','JEV','SEMANTIC'].includes(state.provenance.scorer)||state.provenance.fallbackReason||state.epistemicEffects.length!==1||state.epistemicEffects[0]!=='CORROBORATES')return false;
 }return true;
}
async function sourceChangesReaderMeaning(store:V1FeedStore,feedId:string,entry:LedgerEntry,previous:import('@distilled/contracts').EvidenceRevision,current:import('@distilled/contracts').EvidenceRevision,tx?:FeedTransaction):Promise<boolean>{
 const mentions=(await Promise.all(entry.claimMentionIds.map(id=>store.read<ClaimMention>(feedId,'claim_mentions',id)))).filter((m):m is ClaimMention=>m?.evidenceRevisionId===previous.id);
 if(!mentions.length){
  // No claim-level evidence of what was communicated: stay conservative and judge the whole source.
  const before=[previous.title,previous.body].filter(Boolean).join('\n'),after=[current.title,current.body].filter(Boolean).join('\n');
  if(!revisionChangesMeaning(before,after))return false;
  return provenMaterialDelta(before,after)||!await semanticallyUnchangedRevision(store,feedId,entry,current.id,tx);
 }
 const changed=changedCommunicatedSpans(mentions.map(m=>({field:m.span.field,text:m.sourceText})),previous,current);
 // Every communicated span is still present: added reporting is new information, not a correction.
 if(!changed.length)return false;
 if(changed.some(c=>c.counterparts.some(text=>provenMaterialDelta(c.span.text,text))))return true;
 // An edited/removed communicated span with unknown equivalence stays conservative unless settled semantics say corroboration only.
 return !await semanticallyUnchangedRevision(store,feedId,entry,current.id,tx);
}
/** Deterministic historical projection. It never mutates publication, versions,
 * scopes or source checkpoints. Historical tombstones remain valid ownership
 * roots: disabled/deleted feeds may still rebuild already-published reader state. */
export async function projectEditionLedger(store:V1FeedStore,feedId:string,editionId:string):Promise<LedgerProjection> {
 const edition=await store.read<BriefingEditionRecord>(feedId,'editions',editionId),status=await store.read<PublicationStatus>(feedId,'publication_status',editionId);
 if(!edition || !status || !await store.getFeed(feedId))throw new HandoffError('SCOPE_DENIED');
 const projectionId=ledgerProjectionId(editionId),prior=await store.read<LedgerProjection>(feedId,'ledger_projections',projectionId);
 const writes:{kind:DocumentKind;id:string;value:any}[]=[],entries:LedgerEntry[]=[];
 if(prior){for(const id of prior.entryIds){const entry=await store.read<LedgerEntry>(feedId,'ledger_entries',id);if(!entry)throw new HandoffError('SCOPE_DENIED');entries.push(entry)}}
 else {
  const mentions=await store.list<ClaimMention>(feedId,'claim_mentions'),propositions=await store.list<Proposition>(feedId,'propositions'),selection=await store.read<SelectionRecord>(feedId,'selections',edition.selectionId);
  for(const story of edition.stories){
   const candidate=await store.read<BriefingCandidate>(feedId,'candidates',story.candidateId);if(!candidate)throw new HandoffError('SCOPE_DENIED');
   const eventIds:string[]=[],storylineIds:string[]=[];
   if(candidate.targetType==='EVENT'){const event=await store.read<EventVersion>(feedId,'event_versions',candidate.targetVersionId);if(!event)throw new HandoffError('SCOPE_DENIED');eventIds.push(event.eventId)}
   else {const storyline=await store.read<StorylineVersion>(feedId,'storyline_versions',candidate.targetVersionId);if(!storyline)throw new HandoffError('SCOPE_DENIED');storylineIds.push(storyline.storylineId);for(const versionId of storyline.eventVersionIds){const event=await store.read<EventVersion>(feedId,'event_versions',versionId);if(event)eventIds.push(event.eventId)}}
   const related=selection?.editorialByCandidate?.[candidate.id]?.storylineId;if(related && !storylineIds.includes(related))storylineIds.push(related);
   for(const claim of story.claims){
    const evidenceRevisionIds=[...new Set(claim.support.map(s=>s.evidenceRevisionId))];
    if(evidenceRevisionIds.some(id=>!edition.evidenceRevisionIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
    for(const support of claim.support){const revision=await store.revision(feedId,support.evidenceRevisionId);if(!revision || ![revision.body,revision.title].some(t=>t?.includes(support.quote)))throw new HandoffError('SCOPE_DENIED')}
    const id=await sha256(canonicalJson({feedId,editionId,claimId:claim.id,policy:LEDGER_POLICY}));
    const metadata=await extractClaimMentions({id:claim.id,feedId,contentHash:await sha256(claim.text),body:claim.text,acceptedAt:status.publishedAt} as any);
    const claimMentionIds=mentions.filter(m=>claim.support.some(s=>s.evidenceRevisionId===m.evidenceRevisionId && (s.quote.includes(m.sourceText)||m.sourceText.includes(s.quote)))).map(m=>m.id);
    const entry:LedgerEntry={id,feedId,editionId,claimId:claim.id,candidateId:candidate.id,claimText:claim.text,claimFacts:facts(claim.text),claimMentionIds,propositionIds:[],eventIds:[...new Set(eventIds)],storylineIds,targetType:candidate.targetType,targetVersionId:candidate.targetVersionId,evidenceRevisionIds,certainty:communicatedCertainty(metadata.mentions),attribution:metadata.mentions.find(m=>m.attribution)?.attribution,communicatedAt:status.publishedAt,policyVersion:LEDGER_POLICY};
    entry.propositionIds=propositions.filter(p=>p.evidenceRevisionIds.every(id=>evidenceRevisionIds.includes(id))&&literal(claim.text,p.text)).map(p=>p.id);
    entries.push(entry);writes.push({kind:'ledger_entries',id,value:entry});
   }
  }
 }
 const projection:LedgerProjection=prior??{id:projectionId,feedId,editionId,entryIds:entries.map(e=>e.id),policyVersion:LEDGER_POLICY};
 if(!prior)writes.push({kind:'ledger_projections',id:projectionId,value:projection});
 const stateId=await sha256(canonicalJson({feedId,editionId,status:status.status,withdrawnAt:status.withdrawnAt,reason:status.reason,policy:LEDGER_POLICY}));
 if(!await store.read(feedId,'ledger_states',stateId))writes.push({kind:'ledger_states',id:stateId,value:{id:stateId,feedId,editionId,status:status.status,withdrawnAt:status.withdrawnAt,reason:status.reason,entryIds:projection.entryIds,policyVersion:LEDGER_POLICY}});
 if(status.status==='WITHDRAWN')for(const entry of entries){const obligation=await correctionRecord(entry,'RETRACTED',stateId,status.withdrawnAt??status.publishedAt);if(!await store.read(feedId,'correction_obligations',obligation.id))writes.push({kind:'correction_obligations',id:obligation.id,value:obligation})}
 const selection=await store.read<SelectionRecord>(feedId,'selections',edition.selectionId),plan=selection?.editorialPlanId?await store.read<EditorialPlanRecord>(feedId,'editorial_plans',selection.editorialPlanId):undefined,shortlist=plan?await store.read<ShortlistRecord>(feedId,'shortlists',plan.shortlistId):undefined;
 if(plan && shortlist && status.status==='PUBLISHED'){
  const fidelity=await store.read<{passed:boolean;checks:{candidateId:string;addressedCorrectionObligationIds?:string[]}[]}>(feedId,'fidelity_results',edition.generation.verificationId??edition.selectionId);
  const verification=await store.read<{preservedFactIds?:string[]}>(feedId,'verification_results',edition.generation.verificationId??edition.selectionId),pending=await store.list<EditorialWork> (feedId,'editorial_deferred_work');
  for(const story of edition.stories){const candidate=await store.read<BriefingCandidate>(feedId,'candidates',story.candidateId),planned=plan.stories.find(s=>s.targetVersionId===candidate?.targetVersionId),scope=shortlist.candidates.find(c=>c.targetVersionId===candidate?.targetVersionId);if(!planned||!scope)continue;
   const preserved=scope.facts.filter(f=>story.claims.some(c=>literal(c.text,f.text))||verification?.preservedFactIds?.includes(f.id));
   for(const fact of preserved){const id=JSON.stringify([editionId,story.candidateId,fact.id]);if(!await store.read(feedId,'ledger_fact_bindings',id))writes.push({kind:'ledger_fact_bindings',id,value:{id,feedId,editionId,candidateId:story.candidateId,factId:fact.id,propositionId:fact.propositionId,ledgerEntryIds:entries.filter(e=>e.candidateId===story.candidateId).map(e=>e.id),evidenceRevisionIds:fact.evidenceRevisionIds,policyVersion:LEDGER_POLICY}})}
   if(planned.mustIncludeFactIds.every(id=>preserved.some(f=>f.id===id))){
    for(const obligation of plan.obligations.filter(o=>o.handling==='ADDRESS'&&o.targetVersionId===scope.targetVersionId&&fidelity?.passed&&fidelity.checks.some(c=>c.candidateId===story.candidateId&&c.addressedCorrectionObligationIds?.includes(o.obligationId)))){const id=JSON.stringify([obligation.obligationId,editionId]);if(!await store.read(feedId,'correction_resolutions',id))writes.push({kind:'correction_resolutions',id,value:{id,feedId,obligationId:obligation.obligationId,editionId,planId:plan.id,createdAt:edition.createdAt}})}
    if(planned.deltaType!=='REPEAT')for(const work of pending.filter(w=>w.stableTargetId===scope.stableTargetId&&Date.parse(w.createdAt)<=Date.parse(edition.createdAt)&&(!w.factTexts?.length||w.factTexts.every(text=>[...preserved.map(f=>f.text),...shortlist.ledger.flatMap(e=>e.claimFacts)].some(known=>equivalentFact(text,known)))))){const id=JSON.stringify([work.id,editionId]);if(!await store.read(feedId,'editorial_work_resolutions',id))writes.push({kind:'editorial_work_resolutions',id,value:{id,feedId,workId:work.id,editionId,planId:plan.id,createdAt:edition.createdAt}})}
   }
  }
 }
 // Every byte is derived from an immutable, formerly published edition. No
 // arbitrary projection payload enters this internal API. Scope/immutability
 // triggers protect cross-feed identity, including historical rebuilds.
 if(writes.length)await store.db.batch(writes.map(w=>store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='editions' AND id=? AND feed_id=?) ON CONFLICT(kind,id) DO NOTHING").bind(w.kind,w.id,feedId,JSON.stringify(w.value),editionId,feedId)));
 // Entries are durable before inspecting current support, closing the crash
 // boundary where source reassessment ran while the projection was absent.
 const sourceWrites:typeof writes=[];
 for(const entry of entries)for(const id of entry.evidenceRevisionIds){const revision=await store.revision(feedId,id);if(!revision)continue;
  const row=await store.db.prepare("SELECT e.json FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id WHERE s.feed_id=? AND json_extract(e.json,'$.id')=?").bind(feedId,revision.evidenceId).first<{json:string}>();if(!row)continue;const current=JSON.parse(row.json);
  const kind=current.state==='DELETED'?'SOURCE_DELETED':current.currentRevisionId&&current.currentRevisionId!==id?'SOURCE_REVISED':undefined;
  const next=kind==='SOURCE_REVISED'?await store.revision(feedId,current.currentRevisionId):undefined;
  if(kind && (kind!=='SOURCE_REVISED'||!next||await sourceChangesReaderMeaning(store,feedId,entry,revision,next))){const obligation=await correctionRecord(entry,kind,current.state==='DELETED'?current.currentObservationId:current.currentRevisionId,new Date().toISOString());if(!await store.read(feedId,'correction_obligations',obligation.id))sourceWrites.push({kind:'correction_obligations',id:obligation.id,value:obligation})}
 }
 if(sourceWrites.length)await store.db.batch(sourceWrites.map(w=>store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='editions' AND id=? AND feed_id=?) ON CONFLICT(kind,id) DO NOTHING").bind(w.kind,w.id,feedId,JSON.stringify(w.value),editionId,feedId)));
 return projection;
}
export async function rebuildCommunicationLedger(store:V1FeedStore,feedId:string):Promise<void> {
 for(const edition of await store.list<BriefingEditionRecord>(feedId,'editions'))if(await store.read(feedId,'publication_status',edition.id))await projectEditionLedger(store,feedId,edition.id);
}
async function correctionRecord(entry:LedgerEntry,kind:CorrectionKind,triggerId:string,now:string):Promise<CorrectionObligation> {
 return {id:await sha256(canonicalJson({feedId:entry.feedId,entryId:entry.id,kind,triggerId,policy:LEDGER_POLICY})),feedId:entry.feedId,ledgerEntryId:entry.id,editionId:entry.editionId,kind,triggerId,state:'OPEN',createdAt:now,policyVersion:LEDGER_POLICY};
}
export async function recordCorrectionObligation(tx:FeedTransaction,entry:LedgerEntry,kind:CorrectionKind,triggerId:string,now:string):Promise<void> {
 if(entry.feedId!==tx.snapshot.feed.id || !await tx.read('ledger_entries',entry.id))throw new HandoffError('SCOPE_DENIED');
 const record=await correctionRecord(entry,kind,triggerId,now);if(!await tx.read('correction_obligations',record.id))await tx.write('correction_obligations',record.id,record);
}
/** Absence is never deletion. Only durable source tombstones create deletion
 * obligations; a changed current revision creates a distinct revision obligation. */
export async function refreshSourceCorrectionObligations(tx:FeedTransaction,now:string):Promise<void> {
 for(const entry of await tx.list<LedgerEntry>('ledger_entries'))for(const id of entry.evidenceRevisionIds){
  const revision=await tx.revision(id);if(!revision)continue;
  const row=await tx.store.db.prepare("SELECT e.json FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id WHERE s.feed_id=? AND json_extract(e.json,'$.id')=?").bind(tx.snapshot.feed.id,revision.evidenceId).first<{json:string}>();if(!row)continue;
  const current=JSON.parse(row.json);
  if(current.state==='DELETED')await recordCorrectionObligation(tx,entry,'SOURCE_DELETED',current.currentObservationId,now);
  else if(current.currentRevisionId && current.currentRevisionId!==id){
   const next=await tx.revision(current.currentRevisionId);
   if(!next||await sourceChangesReaderMeaning(tx.store,tx.snapshot.feed.id,entry,revision,next,tx))await recordCorrectionObligation(tx,entry,'SOURCE_REVISED',current.currentRevisionId,now);
   else for(const obligation of (await tx.list<CorrectionObligation>('correction_obligations')).filter(o=>o.ledgerEntryId===entry.id&&o.kind==='SOURCE_REVISED'&&o.triggerId===current.currentRevisionId)){
    const resolutionId=JSON.stringify([obligation.id,'NON_MATERIAL_SOURCE_REVISION']);
    if(!await tx.read('correction_resolutions',resolutionId))await tx.write('correction_resolutions',resolutionId,{id:resolutionId,feedId:tx.snapshot.feed.id,obligationId:obligation.id,reason:'NON_MATERIAL_SOURCE_REVISION',createdAt:now});
   }
  }
 }
}
