import {sha256,type TargetType} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {targets,type PublicationWindow} from './scoring';
import {assessSelfContainment,type FactContext,type SelfContainment} from './self-contained';
import {provenMaterialDelta,provenSlotValueDelta} from './material-delta';
import {communicationFingerprint,evaluateEditorialDelta,noveltyClass,type NoveltyClass,mergeEquivalentFacts,supportedSentences,type EditorialDecision,equivalentFact} from './editorial';
import {refreshSourceCorrectionObligations,type LedgerEntry,type CorrectionObligation} from './ledger';
import type {EventSemanticState,Proposition} from './semantic-state';
import {factTiming,type FactTiming} from './freshness';
import {protectedEffects} from './semantic-routing';
import {cheapEditorialRanking,compareEditorialCandidates,rankEditorialCandidates,type EditorialRanking} from './editorial-ranking';
import {deferEditorialWork,resolveEditorialWork,type EditorialWork} from './editorial-work';
import {CLAIM_EXTRACTOR,type SourceDocument,nonFactRole} from './claims';
import {communicationCost,type CommunicationCost} from './planning-capacity';
import type {Env} from '../types';
export const SHORTLIST_POLICY='high-recall-semantic-shortlist-v12';
export type {NoveltyClass};
export interface ShortlistFact {id:string;timing?:FactTiming;selfContained?:SelfContainment;context?:FactContext;propositionId?:string;mergedPropositionIds?:string[];text:string;evidenceRevisionIds:string[];claimMentionIds:string[];certainty?:Proposition['certainty'];attribution?:string;reportTime?:string;eventTime?:string}
export interface ShortlistCandidate {sourceTitles?:string[];ranking?:EditorialRanking;communicationCost?:CommunicationCost;novelty?:NoveltyClass;targetType:TargetType;targetVersionId:string;stableTargetId:string;storylineId?:string;eventVersionIds:string[];evidenceRevisionIds:string[];facts:ShortlistFact[];stateSlotIds:string[];effects:string[];flags:string[];protectedReasons:string[];correctionObligationIds:string[];priority:number;fallbackEditorial:EditorialDecision}
export interface ShortlistRecord {bootstrap?:boolean;id:string;feedId:string;feedRevision:number;window:PublicationWindow;communicationFingerprint:string;candidates:ShortlistCandidate[];overflow:ShortlistCandidate[];obligations:CorrectionObligation[];ledger:{id:string;claimText:string;claimFacts:string[];eventIds:string[];storylineIds:string[];certainty:LedgerEntry['certainty'];editionId:string}[];evidenceRevisionIds:string[];policyVersion:string;createdAt:string}
export function boundShortlist<T extends {targetVersionId:string;priority:number;protectedReasons:string[];ranking?:EditorialRanking}>(candidates:T[],ordinaryLimit:number):{selected:T[];overflow:T[]} {
 const sorted=[...candidates].sort(compareEditorialCandidates);let ordinary=0;const selected:T[]=[],overflow:T[]=[];
 for(const c of sorted)if(c.protectedReasons.length||ordinary++<ordinaryLimit)selected.push(c);else overflow.push(c);return {selected,overflow};
}
export async function shortlistInTransaction(tx:FeedTransaction,window:PublicationWindow,now:string,ordinaryLimit=20,options:{collectOnly?:boolean;rankings?:Map<string,EditorialRanking>}={}):Promise<ShortlistRecord> {
 await refreshSourceCorrectionObligations(tx,now);
 const earlierEditions=new Set((await tx.list<import('./publication').BriefingEditionRecord>('editions')).filter(e=>Date.parse(e.windowEnd)<Date.parse(window.end)).map(e=>e.id));
 const ledger=(await tx.list<LedgerEntry>('ledger_entries')).filter(e=>earlierEditions.has(e.editionId)),resolved=new Set((await tx.list<{id:string;obligationId:string}>('correction_resolutions')).map(r=>r.obligationId));
 const workResolutions=await tx.list<{id:string;workId:string;reason?:string}>('editorial_work_resolutions'),allWork=await tx.list<EditorialWork>('editorial_deferred_work');
 const completedWork=new Set(workResolutions.map(r=>r.workId)),pendingWork=allWork.filter(w=>!completedWork.has(w.id));
 const retiredVersions=new Set(allWork.filter(w=>w.windowEnd&&Date.parse(w.windowEnd)<Date.parse(window.end)&&workResolutions.some(r=>r.workId===w.id&&['OMITTED_BY_EDITOR','STALE_AFTER_SEVEN_DAYS'].includes(r.reason??''))).map(w=>w.targetVersionId));
 const withdrawnStates=await tx.list<{id:string;editionId:string;status:string;reason:string}>('ledger_states');
 const obligations=(await tx.list<CorrectionObligation>('correction_obligations')).filter(o=>!resolved.has(o.id)).map(o=>{
  const withdrawal=withdrawnStates.find(s=>s.id===o.triggerId&&s.editionId===o.editionId&&s.status==='WITHDRAWN');
  return withdrawal?{...o,publicationWithdrawal:{reason:withdrawal.reason}}:o;
 });
 const sourceDocuments=await tx.list<SourceDocument>('source_documents');
 const candidates:ShortlistCandidate[]=[];
 const currentTargets=await targets(tx,window,true);
 for(const work of pendingWork){
  const target=currentTargets.find(t=>t.stableId===work.stableTargetId);
  if(!target){await resolveEditorialWork(tx,work,'SUPERSEDED_OR_INACTIVE',now,window.end);completedWork.add(work.id)}
  else if(work.expiresAt&&Date.parse(work.expiresAt)<Date.parse(now)&&!work.protectedReasons.length){await resolveEditorialWork(tx,work,'STALE_AFTER_SEVEN_DAYS',now,window.end);completedWork.add(work.id);retiredVersions.add(work.targetVersionId)}
  else if(work.targetVersionId!==target.id){await resolveEditorialWork(tx,work,'REPLACED_BY_CURRENT_VERSION',now,window.end);}
 }
 const bootstrap=earlierEditions.size===0;
 for(const target of currentTargets){
  const related=obligations.filter(o=>{const entry=ledger.find(e=>e.id===o.ledgerEntryId);return entry?.eventIds.includes(target.stableId)||target.storylineId && entry?.storylineIds.includes(target.storylineId)});
  if(retiredVersions.has(target.id)&&!related.length)continue;
  const deferred=pendingWork.filter(w=>!completedWork.has(w.id)&&(w.stableTargetId===target.stableId||target.storylineId && w.storylineId===target.storylineId));
  if(Date.parse(target.updatedAt)<Date.parse(window.start) && !bootstrap && !related.length && !deferred.length)continue;
  const states=(await Promise.all(target.eventVersionIds.map(id=>tx.read<EventSemanticState>('event_semantic_states',id)))).filter((s):s is EventSemanticState=>Boolean(s)),rawFacts:ShortlistFact[]=[];
  for(const id of [...new Set(states.flatMap(s=>s.propositionIds))]){const p=await tx.read<Proposition>('propositions',id);if(p&&!nonFactRole(p.text))rawFacts.push({id:p.id,propositionId:p.id,text:p.text,evidenceRevisionIds:p.evidenceRevisionIds,claimMentionIds:p.claimMentionIds,certainty:p.certainty,attribution:p.attribution,reportTime:p.reportTime,eventTime:p.eventTime})}
  if(!rawFacts.length)for(const evidence of target.evidence)for(const text of supportedSentences(evidence.body??evidence.title??'').filter(text=>!nonFactRole(text)))rawFacts.push({id:await sha256(canonicalJson({feedId:tx.snapshot.feed.id,evidenceId:evidence.id,text,policy:SHORTLIST_POLICY})),text,evidenceRevisionIds:[evidence.id],claimMentionIds:[]});
  // One reader-facing fact per supported meaning: equivalent propositions from different mentions/publishers keep every support reference.
  const sameTime=(a?:string,b?:string)=>a===b,facts=mergeEquivalentFacts(rawFacts,(survivor,duplicate)=>{survivor.claimMentionIds=[...new Set([...survivor.claimMentionIds,...duplicate.claimMentionIds])];survivor.mergedPropositionIds=[...new Set([...(survivor.mergedPropositionIds??[]),...(duplicate.propositionId?[duplicate.propositionId]:[])])]},(a,b)=>a.attribution===b.attribution&&sameTime(a.eventTime,b.eventTime)&&(a.certainty?.kind??'UNSPECIFIED')===(b.certainty?.kind??'UNSPECIFIED'));
  // Preserve proposition report/event times separately from source publication and Feed observation.
  if(!facts.length)continue;
  for(const fact of facts){fact.timing=factTiming(target.evidence.filter(e=>fact.evidenceRevisionIds.includes(e.id)),window,fact);fact.reportTime=fact.timing.reportTime;}
  for(const fact of facts){const a=assessSelfContainment(fact.text,target.evidence.filter(e=>fact.evidenceRevisionIds.includes(e.id)));fact.selfContained=a.status;if(a.context)fact.context=a.context}
  const editorial=await evaluateEditorialDelta(tx,target,window.end,window.start),effects=[...new Set(states.flatMap(s=>s.epistemicEffects))],protectedReasons:string[]=effects.filter(e=>protectedEffects.has(e));
  if(related.length)protectedReasons.push('CORRECTION_OBLIGATION');
  // Recompute protection from supported meaning, never inherit a historic false
  // numeric-presence flag from deferred work. Unknown paraphrases stay ordinary.
  const known=editorial.previouslyCommunicated.filter(p=>!p.withdrawn).flatMap(p=>p.facts);
  const currentSlots=(await Promise.all(states.flatMap(s=>s.stateSlotIds).map(id=>tx.read<import('./semantic-state').StateSlot>('state_slots',id)))).filter((s):s is import('./semantic-state').StateSlot=>Boolean(s));
  const priorVersionIds=(await tx.list<import('./publication').BriefingEditionRecord>('editions')).filter(e=>earlierEditions.has(e.id)).flatMap(e=>e.eventVersionIds);
  let structuredDelta=false;
  for(const versionId of currentSlots.length?priorVersionIds:[]){const version=await tx.read<import('@distilled/contracts').EventVersion>('event_versions',versionId);if(!version||!editorial.previouslyCommunicated.some(p=>p.targetVersionId===versionId))continue;
   const old=await tx.read<EventSemanticState>('event_semantic_states',versionId);for(const id of old?.stateSlotIds??[]){const slot=await tx.read<import('./semantic-state').StateSlot>('state_slots',id),proposition=slot?await tx.read<Proposition>('propositions',slot.propositionId):undefined;
    if(!slot?.entityId||!proposition||!known.some(text=>equivalentFact(text,proposition.text)))continue;
    const priorEntity=await tx.read<import('./semantic-state').Entity>('entities',slot.entityId),currentEntities=await Promise.all(currentSlots.map(s=>s.entityId?tx.read<import('./semantic-state').Entity>('entities',s.entityId):undefined));
    structuredDelta ||= currentSlots.some((s,i)=>Boolean(priorEntity&&currentEntities[i]?.entityId===priorEntity.entityId)&&s.attribute===slot.attribute&&s.asOf===slot.asOf&&(provenSlotValueDelta(slot.value,s.value)||s.certainty.kind!==slot.certainty.kind||(s.attribution??'').normalize('NFKC').toLowerCase().trim()!==(slot.attribution??'').normalize('NFKC').toLowerCase().trim()));
   }
  }
  if(structuredDelta||editorial.newUnderstanding.some(f=>known.some(previous=>provenMaterialDelta(previous,f.text))))protectedReasons.push('MATERIAL_QUALIFIER_DELTA');
  // Even a historical semantic effect cannot protect an exactly witnessed
  // repeated fact. Explicit open obligations still require resolution.
  const repeatedProtectedEffect=protectedReasons.length>0&&!related.length&&facts.every(f=>known.some(text=>equivalentFact(text,f.text)));
  if(repeatedProtectedEffect)protectedReasons.splice(0);
  const titleExtractionPending=target.evidence.some(e=>e.title&&!nonFactRole(e.title)&&!sourceDocuments.some(d=>d.evidenceRevisionId===e.id&&d.extractorVersion===CLAIM_EXTRACTOR));
  const identityAffectsHistory=states.some(s=>s.provisional)&&facts.some(f=>ledger.some(e=>e.claimFacts.some(old=>equivalentFact(old,f.text)||provenMaterialDelta(old,f.text))));
  const flags=[...(repeatedProtectedEffect?['SETTLED_REPEATED_EFFECT']:[]),...(titleExtractionPending?['TITLE_EXTRACTION_PENDING']:[]),...(editorial.decision==='SUPPRESS'?['POSSIBLE_REPEAT']:[]),...(editorial.reasonCodes.includes('OLD_RECAP')?['OLD_RECAP']:[]),...(states.some(s=>s.provisional)?['PROVISIONAL']:[]),...(states.some(s=>s.provisional)&&(protectedReasons.length||known.length||identityAffectsHistory)?['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE']:[]),...(facts.some(f=>f.certainty?.hedges.length)?['QUALIFIED']:[]),...(facts.some(f=>f.selfContained==='UNRESOLVED')?['NON_SELF_CONTAINED']:[])];
  const candidate:ShortlistCandidate={sourceTitles:[...new Set(target.evidence.map(e=>e.title).filter((s):s is string=>Boolean(s)))].slice(0,3),novelty:noveltyClass(editorial.reasonCodes[0],effects),targetType:target.type,targetVersionId:target.id,stableTargetId:target.stableId,storylineId:target.storylineId,eventVersionIds:target.eventVersionIds,evidenceRevisionIds:target.evidence.map(e=>e.id),facts,stateSlotIds:[...new Set(states.flatMap(s=>s.stateSlotIds))],effects,flags,protectedReasons:[...new Set(protectedReasons)],correctionObligationIds:related.map(o=>o.id),priority:protectedReasons.length?1:editorial.reasonCodes.includes('OLD_RECAP')?.3:editorial.newUnderstanding.length?.6:.2,fallbackEditorial:editorial};
  candidate.ranking=options.rankings?.get(target.id)??cheapEditorialRanking(tx.snapshot.feed,candidate);
  candidate.communicationCost=communicationCost(candidate);candidate.priority=candidate.ranking.score;
  const knownRepeat=editorial.previouslyCommunicated.length>0&&editorial.newUnderstanding.length===0&&editorial.reasonCodes.some(reason=>['ALREADY_COMMUNICATED','CORROBORATION_ONLY'].includes(reason));
  if(deferred.length&&knownRepeat&&!related.length)for(const work of deferred)await resolveEditorialWork(tx,work,'ALREADY_COMMUNICATED',now,window.end);
  if(knownRepeat&&!candidate.protectedReasons.length&&!related.length)continue;
  candidates.push(candidate);
 }
 const communication=await communicationFingerprint(tx,window.end),bounded=boundShortlist(candidates,ordinaryLimit),id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,revision:tx.snapshot.feed.revision,window,communication,candidates:candidates.map(c=>[c.targetVersionId,c.protectedReasons,c.correctionObligationIds]).sort(),ordinaryLimit,ranking:candidates.map(c=>[c.targetVersionId,c.ranking]),bootstrap,policy:SHORTLIST_POLICY}));
 const prior=await tx.read<ShortlistRecord>('shortlists',id);if(prior)return prior;
 const value:ShortlistRecord={bootstrap,id,feedId:tx.snapshot.feed.id,feedRevision:tx.snapshot.feed.revision,window,communicationFingerprint:communication,candidates:bounded.selected,overflow:bounded.overflow,obligations,ledger:ledger.map(e=>({id:e.id,claimText:e.claimText,claimFacts:e.claimFacts,eventIds:e.eventIds,storylineIds:e.storylineIds,certainty:e.certainty,editionId:e.editionId})),evidenceRevisionIds:[...new Set(bounded.selected.flatMap(c=>c.evidenceRevisionIds))],policyVersion:SHORTLIST_POLICY,createdAt:now};if(!options.collectOnly){await tx.write('shortlists',id,value);for(const c of bounded.overflow)await deferEditorialWork(tx,c,'SHORTLIST_OVERFLOW',now,id,window.end)}return value;
}
export async function prepareSemanticShortlist(store:V1FeedStore,feedId:string,window:PublicationWindow,now:string,ordinaryLimit=20,env?:Env,fetcher:typeof fetch=fetch):Promise<ShortlistRecord>{
 if(!env)return feedTransact(store,feedId,tx=>shortlistInTransaction(tx,window,now,ordinaryLimit));
 const draft=await feedTransact(store,feedId,tx=>shortlistInTransaction(tx,window,now,10000,{collectOnly:true}));
 const feed=await store.getFeed(feedId);if(!feed)throw new Error('Missing Feed');
 const ranked=await rankEditorialCandidates(store,env,feed,draft.candidates,window,now,fetcher);
 return feedTransact(store,feedId,tx=>shortlistInTransaction(tx,window,now,ordinaryLimit,{rankings:new Map(ranked.map(c=>[c.targetVersionId,c.ranking!]))}));
}
