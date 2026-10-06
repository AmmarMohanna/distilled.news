import {sha256,type TargetType} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {targets,type PublicationWindow} from './scoring';
import {assessSelfContainment,type FactContext,type SelfContainment} from './self-contained';
import {communicationFingerprint,evaluateEditorialDelta,noveltyClass,type NoveltyClass,mergeEquivalentFacts,supportedSentences,type EditorialDecision} from './editorial';
import {type LedgerEntry,type CorrectionObligation} from './ledger';
import type {EventSemanticState,Proposition} from './semantic-state';
import {protectedEffects} from './semantic-routing';
export const SHORTLIST_POLICY='high-recall-semantic-shortlist-v1';
export type {NoveltyClass};
export interface ShortlistFact {id:string;selfContained?:SelfContainment;context?:FactContext;propositionId?:string;mergedPropositionIds?:string[];text:string;evidenceRevisionIds:string[];claimMentionIds:string[];certainty?:Proposition['certainty'];attribution?:string;reportTime?:string;eventTime?:string}
export interface ShortlistCandidate {novelty?:NoveltyClass;targetType:TargetType;targetVersionId:string;stableTargetId:string;storylineId?:string;eventVersionIds:string[];evidenceRevisionIds:string[];facts:ShortlistFact[];stateSlotIds:string[];effects:string[];flags:string[];protectedReasons:string[];correctionObligationIds:string[];priority:number;fallbackEditorial:EditorialDecision}
export interface ShortlistRecord {id:string;feedId:string;feedRevision:number;window:PublicationWindow;communicationFingerprint:string;candidates:ShortlistCandidate[];overflow:ShortlistCandidate[];obligations:CorrectionObligation[];ledger:{id:string;claimText:string;claimFacts:string[];eventIds:string[];storylineIds:string[];certainty:LedgerEntry['certainty'];editionId:string}[];evidenceRevisionIds:string[];policyVersion:string;createdAt:string}
export function boundShortlist<T extends {targetVersionId:string;priority:number;protectedReasons:string[]}>(candidates:T[],ordinaryLimit:number):{selected:T[];overflow:T[]} {
 const sorted=[...candidates].sort((a,b)=>b.priority-a.priority||a.targetVersionId.localeCompare(b.targetVersionId));let ordinary=0;const selected:T[]=[],overflow:T[]=[];
 for(const c of sorted)if(c.protectedReasons.length||ordinary++<ordinaryLimit)selected.push(c);else overflow.push(c);return {selected,overflow};
}
export async function shortlistInTransaction(tx:FeedTransaction,window:PublicationWindow,now:string,ordinaryLimit=20):Promise<ShortlistRecord> {
 const earlierEditions=new Set((await tx.list<import('./publication').BriefingEditionRecord>('editions')).filter(e=>Date.parse(e.windowEnd)<Date.parse(window.end)).map(e=>e.id));
 const ledger=(await tx.list<LedgerEntry>('ledger_entries')).filter(e=>earlierEditions.has(e.editionId)),resolved=new Set((await tx.list<{id:string;obligationId:string}>('correction_resolutions')).map(r=>r.obligationId));
 const completedWork=new Set((await tx.list<{id:string;workId:string}>('editorial_work_resolutions')).map(r=>r.workId)),pendingWork=(await tx.list<{id:string;stableTargetId:string;storylineId?:string}>('editorial_deferred_work')).filter(w=>!completedWork.has(w.id));
 const obligations=(await tx.list<CorrectionObligation>('correction_obligations')).filter(o=>!resolved.has(o.id));
 const candidates:ShortlistCandidate[]=[];
 for(const target of await targets(tx,window,true)){
  const related=obligations.filter(o=>{const entry=ledger.find(e=>e.id===o.ledgerEntryId);return entry?.eventIds.includes(target.stableId)||target.storylineId && entry?.storylineIds.includes(target.storylineId)});
  const deferred=pendingWork.filter(w=>w.stableTargetId===target.stableId||target.storylineId && w.storylineId===target.storylineId);
  if(Date.parse(target.updatedAt)<Date.parse(window.start) && !related.length && !deferred.length)continue;
  const states=(await Promise.all(target.eventVersionIds.map(id=>tx.read<EventSemanticState>('event_semantic_states',id)))).filter((s):s is EventSemanticState=>Boolean(s)),rawFacts:ShortlistFact[]=[];
  for(const id of [...new Set(states.flatMap(s=>s.propositionIds))]){const p=await tx.read<Proposition>('propositions',id);if(p)rawFacts.push({id:p.id,propositionId:p.id,text:p.text,evidenceRevisionIds:p.evidenceRevisionIds,claimMentionIds:p.claimMentionIds,certainty:p.certainty,attribution:p.attribution,reportTime:p.reportTime,eventTime:p.eventTime})}
  if(!rawFacts.length)for(const evidence of target.evidence)for(const text of supportedSentences(evidence.body??evidence.title??''))rawFacts.push({id:await sha256(canonicalJson({feedId:tx.snapshot.feed.id,evidenceId:evidence.id,text,policy:SHORTLIST_POLICY})),text,evidenceRevisionIds:[evidence.id],claimMentionIds:[]});
  // One reader-facing fact per supported meaning: equivalent propositions from different mentions/publishers keep every support reference.
  const sameTime=(a?:string,b?:string)=>a===b,facts=mergeEquivalentFacts(rawFacts,(survivor,duplicate)=>{survivor.claimMentionIds=[...new Set([...survivor.claimMentionIds,...duplicate.claimMentionIds])];survivor.mergedPropositionIds=[...new Set([...(survivor.mergedPropositionIds??[]),...(duplicate.propositionId?[duplicate.propositionId]:[])])]},(a,b)=>a.attribution===b.attribution&&sameTime(a.eventTime,b.eventTime)&&(a.certainty?.kind??'UNSPECIFIED')===(b.certainty?.kind??'UNSPECIFIED'));
  // Source publication time dates the fact for the writer; it never replaces a proposition's own report time.
  for(const fact of facts)if(!fact.reportTime){const dates=target.evidence.filter(e=>fact.evidenceRevisionIds.includes(e.id)&&e.publishedAt).map(e=>e.publishedAt!).sort();if(dates.length)fact.reportTime=dates[0]}
  for(const fact of facts){const a=assessSelfContainment(fact.text,target.evidence.filter(e=>fact.evidenceRevisionIds.includes(e.id)));fact.selfContained=a.status;if(a.context)fact.context=a.context}
  const editorial=await evaluateEditorialDelta(tx,target,window.end,window.start),effects=[...new Set(states.flatMap(s=>s.epistemicEffects))],protectedReasons:string[]=effects.filter(e=>protectedEffects.has(e));
  if(related.length)protectedReasons.push('CORRECTION_OBLIGATION');
  if(deferred.length)protectedReasons.push('DEFERRED_EDITORIAL_WORK');
  if(editorial.previouslyCommunicated.length && editorial.newUnderstanding.some(f=>/\p{N}|\b(may|might|could|confirmed|alleged|not|never)\b/iu.test(f.text)))protectedReasons.push('MATERIAL_QUALIFIER_DELTA');
  const flags=[...(editorial.decision==='SUPPRESS'?['POSSIBLE_REPEAT']:[]),...(editorial.reasonCodes.includes('OLD_RECAP')?['OLD_RECAP']:[]),...(states.some(s=>s.provisional)?['PROVISIONAL']:[]),...(facts.some(f=>f.certainty?.hedges.length)?['QUALIFIED']:[]),...(facts.some(f=>f.selfContained==='UNRESOLVED')?['NON_SELF_CONTAINED']:[])];
  candidates.push({novelty:noveltyClass(editorial.reasonCodes[0],effects),targetType:target.type,targetVersionId:target.id,stableTargetId:target.stableId,storylineId:target.storylineId,eventVersionIds:target.eventVersionIds,evidenceRevisionIds:target.evidence.map(e=>e.id),facts,stateSlotIds:[...new Set(states.flatMap(s=>s.stateSlotIds))],effects,flags,protectedReasons:[...new Set(protectedReasons)],correctionObligationIds:related.map(o=>o.id),priority:protectedReasons.length?1:editorial.reasonCodes.includes('OLD_RECAP')?.3:editorial.newUnderstanding.length?.6:.2,fallbackEditorial:editorial});
 }
 const communication=await communicationFingerprint(tx,window.end),bounded=boundShortlist(candidates,ordinaryLimit),id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,revision:tx.snapshot.feed.revision,window,communication,candidates:candidates.map(c=>[c.targetVersionId,c.protectedReasons,c.correctionObligationIds]).sort(),ordinaryLimit,policy:SHORTLIST_POLICY}));
 const prior=await tx.read<ShortlistRecord>('shortlists',id);if(prior)return prior;
 const value:ShortlistRecord={id,feedId:tx.snapshot.feed.id,feedRevision:tx.snapshot.feed.revision,window,communicationFingerprint:communication,candidates:bounded.selected,overflow:bounded.overflow,obligations,ledger:ledger.map(e=>({id:e.id,claimText:e.claimText,claimFacts:e.claimFacts,eventIds:e.eventIds,storylineIds:e.storylineIds,certainty:e.certainty,editionId:e.editionId})),evidenceRevisionIds:[...new Set(bounded.selected.flatMap(c=>c.evidenceRevisionIds))],policyVersion:SHORTLIST_POLICY,createdAt:now};await tx.write('shortlists',id,value);return value;
}
export function prepareSemanticShortlist(store:V1FeedStore,feedId:string,window:PublicationWindow,now:string,ordinaryLimit=20):Promise<ShortlistRecord>{return feedTransact(store,feedId,tx=>shortlistInTransaction(tx,window,now,ordinaryLimit))}
