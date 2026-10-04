import {sha256,type BriefingCandidate,type EventVersion,type EvidenceRevision,type TargetType} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction} from './store';
import type {BriefingEditionRecord} from './publication';
import type {StorylineVersion} from './types';
import {features} from './policies';

export const EDITORIAL_POLICY='supported-delta-v1';
export type EditorialReason='MAJOR_STATE_CHANGE'|'MATERIAL_NEW_FACT'|'NEW_SUPPORTED_DEVELOPMENT'|'ALREADY_COMMUNICATED'|'CORROBORATION_ONLY'|'LOW_INFORMATION_GAIN'|'LOW_RELEVANCE';
export interface EditorialFact {text:string;evidenceRevisionIds:string[]}
export interface CommunicatedState {editionId:string;targetType:TargetType;targetVersionId:string;claimIds:string[];facts:string[];evidenceRevisionIds:string[]}
export interface EditorialDecision {
 policyVersion:string;targetType:TargetType;targetVersionId:string;stableTargetId:string;storylineId?:string;
 decision:'INCLUDE'|'SUPPRESS';reasonCodes:EditorialReason[];previouslyCommunicated:CommunicatedState[];
 newUnderstanding:EditorialFact[];repeatedFactCount:number;repeatPenalty:number;
 contextNeed:'NONE'|'SMALL'|'MODERATE'|'HIGH';treatment:'OMIT'|'BRIEF'|'STANDARD'|'DETAILED';
}
export interface EditorialTarget {type:TargetType;id:string;stableId:string;storylineId?:string;evidence:EvidenceRevision[];eventVersionIds:string[]}
/** Keep the complete immutable history in selection metadata, but give synthesis
 * only the latest relevant edition's small context. The full delta is retained. */
export function boundedEditorialContext(value:EditorialDecision):EditorialDecision {
 return {...value,previouslyCommunicated:value.previouslyCommunicated.slice(0,1).map(p=>({...p,claimIds:p.claimIds.slice(0,2),facts:p.facts.slice(0,2).map(f=>f.slice(0,400)),evidenceRevisionIds:p.evidenceRevisionIds.slice(0,3)}))};
}
const aliases:Record<string,string>={approved:'approve',passed:'approve',approves:'approve',legislation:'law',resigned:'resign',signs:'sign',signed:'sign',affects:'affect',affected:'affect'};
export function supportedSentences(text:string):string[] {
 return text.normalize('NFKC').trim().split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/u).map(s=>s.trim()).filter(Boolean);
}
/** Conservative deterministic equivalence, not entailment. Critical qualifiers
 * and ordered quantities must match before lexical paraphrases can be collapsed. */
export function equivalentFact(a:string,b:string):boolean {
 const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 if(normalized(a)===normalized(b)) return true;
 const quantities=(s:string)=>JSON.stringify(normalized(s).match(/\b\d+(?:[.,]\d+)*%?\b/g)??[]);
 const qualifiers=(s:string)=>JSON.stringify([...new Set(normalized(s).match(/\b(?:not|no|never|without|may|might|could|expected|alleged|unconfirmed|unresolved|estimated|more than|less than|at least|up to)\b/g)??[])].sort());
 if(quantities(a)!==quantities(b) || qualifiers(a)!==qualifiers(b)) return false;
 const words=(s:string)=>(normalized(s).match(/[\p{L}\p{N}]+|[^\s]/gu)??[]).map(w=>aliases[w]??w);
 // Preserve argument order and attribution. A shared bag of words does not
 // establish that the same actor performed the same action on the same object.
 // Retain punctuation in its position: signs/units attach to quantities and
 // quotation/parenthetical punctuation can change attribution.
 return JSON.stringify(words(a))===JSON.stringify(words(b));
}
/** Immutable edition IDs stand for immutable claims; published status remains
 * mutable. Fence both cache reuse and publication against changed reader state. */
export async function communicationFingerprint(tx:FeedTransaction,windowEnd:string):Promise<string> {
 const ids:string[]=[];
 for(const edition of await tx.list<BriefingEditionRecord>('editions')) {
  if(Date.parse(edition.windowEnd)>=Date.parse(windowEnd)) continue;
  if((await tx.read<{status:string}>('publication_status',edition.id))?.status==='PUBLISHED') ids.push(edition.id);
 }
 return sha256(canonicalJson({feedId:tx.snapshot.feed.id,editionIds:ids.sort()}));
}
export async function communicatedState(tx:FeedTransaction,target:EditorialTarget,windowEnd:string):Promise<CommunicatedState[]> {
 const lineage=new Set<string>();
 for(const id of target.eventVersionIds) {const version=await tx.read<EventVersion>('event_versions',id);if(version) lineage.add(version.eventId)}
 if(target.storylineId) for(const version of await tx.list<StorylineVersion>('storyline_versions')) {
  if(version.storylineId!==target.storylineId) continue;
  for(const id of version.eventVersionIds) {const event=await tx.read<EventVersion>('event_versions',id);if(event) lineage.add(event.eventId)}
 }
 const result:CommunicatedState[]=[];
 const editions=(await tx.list<BriefingEditionRecord>('editions')).filter(e=>Date.parse(e.windowEnd)<Date.parse(windowEnd)).sort((a,b)=>b.windowEnd.localeCompare(a.windowEnd)||a.id.localeCompare(b.id));
 for(const edition of editions) {
  const status=await tx.read<{status:string}>('publication_status',edition.id);if(status?.status!=='PUBLISHED') continue;
  for(const story of edition.stories) {
   const candidate=await tx.read<BriefingCandidate>('candidates',story.candidateId);if(!candidate) continue;
   let related=false;
   if(candidate.targetType==='EVENT') {
    const old=await tx.read<EventVersion>('event_versions',candidate.targetVersionId);related=Boolean(old && lineage.has(old.eventId));
   } else {
    const old=await tx.read<StorylineVersion>('storyline_versions',candidate.targetVersionId);
    related=Boolean(old && old.storylineId===target.storylineId);
    if(old && !related) for(const id of old.eventVersionIds) {const event=await tx.read<EventVersion>('event_versions',id);if(event && lineage.has(event.eventId)) related=true}
   }
   if(!related) continue;
   result.push({editionId:edition.id,targetType:candidate.targetType,targetVersionId:candidate.targetVersionId,claimIds:story.claims.map(c=>c.id),facts:story.claims.flatMap(c=>supportedSentences(c.text)),evidenceRevisionIds:[...new Set(story.claims.flatMap(c=>c.support.map(s=>s.evidenceRevisionId)))]});
  }
 }
 return result;
}
export async function evaluateEditorialDelta(tx:FeedTransaction,target:EditorialTarget,windowEnd:string):Promise<EditorialDecision> {
 const previous=await communicatedState(tx,target,windowEnd),facts:EditorialFact[]=[];
 for(const evidence of target.evidence) for(const text of supportedSentences(evidence.body??evidence.title??'')) {
  const same=facts.find(f=>equivalentFact(f.text,text));
  if(same) same.evidenceRevisionIds.push(evidence.id);else facts.push({text,evidenceRevisionIds:[evidence.id]});
 }
 const known=previous.flatMap(p=>p.facts),newUnderstanding=facts.filter(f=>!known.some(old=>equivalentFact(old,f.text)));
 const repeatedFactCount=facts.length-newUnderstanding.length,repeatPenalty=facts.length?repeatedFactCount/facts.length:1;
 const priorPhases=new Set(known.map(t=>features(t).development));
 const changedPhase=previous.length>0 && newUnderstanding.some(f=>{
  const phase=features(f.text).development;
  return phase!=='report' && !priorPhases.has(phase);
 });
 const include=newUnderstanding.length>0;
 const reasonCodes:EditorialReason[]=!include?[previous.length && target.evidence.some(e=>!previous.some(p=>p.evidenceRevisionIds.includes(e.id)))?'CORROBORATION_ONLY':'ALREADY_COMMUNICATED']:!previous.length?['NEW_SUPPORTED_DEVELOPMENT']:changedPhase?['MAJOR_STATE_CHANGE']:['MATERIAL_NEW_FACT'];
 const caveats=newUnderstanding.some(f=>/\b(unresolved|uncertain|disputed|may|might|no new date|not confirmed|however|but)\b/i.test(f.text));
 const contextNeed=!include?'NONE':changedPhase || caveats?'MODERATE':previous.length?'SMALL':'NONE';
 return {policyVersion:EDITORIAL_POLICY,targetType:target.type,targetVersionId:target.id,stableTargetId:target.stableId,storylineId:target.storylineId,decision:include?'INCLUDE':'SUPPRESS',reasonCodes,previouslyCommunicated:previous,newUnderstanding,repeatedFactCount,repeatPenalty,contextNeed,treatment:!include?'OMIT':caveats || newUnderstanding.length>=4?'DETAILED':changedPhase || newUnderstanding.length>1?'STANDARD':'BRIEF'};
}
