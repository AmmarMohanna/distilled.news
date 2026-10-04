import {HandoffError,type EvidenceRevision,type EventVersion} from '@distilled/contracts';
import {z} from 'zod';
import {INTELLIGENCE_POLICY,features,eventSimilarity,overlap} from './policies';
import type {EvidenceRole} from './types';

export type EpistemicEffect='CORROBORATES'|'ADDS_DETAIL'|'CHANGES_STATE'|'CHANGES_CERTAINTY'|'CONTRADICTS'|'CORRECTS'|'RETRACTS';
export type StructuralRelation='SAME_EVENT'|'NEW_EVENT_EXISTING_STORYLINE'|'NEW_STORYLINE'|'DEFER';
export interface MatchProvenance {scorer:string;policyVersion:string;judgmentId?:string;fallbackReason?:string}
export interface EventMatchDecision {structuralRelation:StructuralRelation;eventId?:string;storylineId?:string;epistemicEffects:EpistemicEffect[];confidence:number;provenance:MatchProvenance}
export interface EventMatchInput {
 revision:EvidenceRevision;role:EvidenceRole;duplicateOfRevisionId?:string;
 candidates:{id:string;version:EventVersion;evidenceRevisionIds:string[];newestAt:string}[];
 storylineIds?:string[];
 storylineVersions?:Record<string,string>;
}
export interface StorylineMatchInput {event:EventVersion;candidates:{id:string;events:EventVersion[]}[]}
export interface StorylineMatchDecision {relation:'CONTINUES'|'NEW'|'DEFER';storylineId?:string;confidence:number;provenance:MatchProvenance}
/** Consumption ports are deliberately synchronous: prepared durable judgments,
 * never model/network operations, may be applied in a retryable transaction. */
export interface EventMatcher {match(input:EventMatchInput):EventMatchDecision}
export interface StorylineMatcher {match(input:StorylineMatchInput):StorylineMatchDecision}
export interface IntelligenceMatchers {event:EventMatcher;storyline:StorylineMatcher;construction?(input:EventMatchInput):import('./semantic-state').SemanticConstruction|undefined}
const provenance=z.object({scorer:z.string().min(1),policyVersion:z.string().min(1),judgmentId:z.string().optional(),fallbackReason:z.string().optional()}).strict();
const confidence=z.number().finite().min(0).max(1),id=z.string().min(1);
const eventDecision=z.object({structuralRelation:z.enum(['SAME_EVENT','NEW_EVENT_EXISTING_STORYLINE','NEW_STORYLINE','DEFER']),eventId:id.optional(),storylineId:id.optional(),epistemicEffects:z.array(z.enum(['CORROBORATES','ADDS_DETAIL','CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'])),confidence,provenance}).strict();
const storylineDecision=z.object({relation:z.enum(['CONTINUES','NEW','DEFER']),storylineId:id.optional(),confidence,provenance}).strict();
export function validateEventMatch(value:EventMatchDecision,input:EventMatchInput):EventMatchDecision {
 const result=eventDecision.safeParse(value);
 if(!result.success || result.data.structuralRelation==='SAME_EVENT' && !input.candidates.some(c=>c.id===result.data.eventId) || result.data.structuralRelation!=='SAME_EVENT' && result.data.eventId)throw new HandoffError('SCOPE_DENIED');
 if(result.data.storylineId && !input.storylineIds?.includes(result.data.storylineId) || result.data.structuralRelation==='NEW_EVENT_EXISTING_STORYLINE' && !result.data.storylineId)throw new HandoffError('SCOPE_DENIED');
 return result.data;
}
export function validateStorylineMatch(value:StorylineMatchDecision,input:StorylineMatchInput):StorylineMatchDecision {
 const result=storylineDecision.safeParse(value);
 if(!result.success || result.data.relation==='CONTINUES' && !input.candidates.some(c=>c.id===result.data.storylineId) || result.data.relation!=='CONTINUES' && result.data.storylineId)throw new HandoffError('SCOPE_DENIED');
 return result.data;
}
const text=(revision:EvidenceRevision)=>[revision.title,revision.body].filter(Boolean).join('\n');
const lexicalProvenance={scorer:'DETERMINISTIC',policyVersion:INTELLIGENCE_POLICY};
export class LexicalEventMatcher implements EventMatcher {
 match(input:EventMatchInput):EventMatchDecision {
  if(['NOISE','PROMOTION','OPINION','UNVERIFIED_LEAD'].includes(input.role))return {structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:lexicalProvenance};
  let selected:string|undefined,best=.4;
  const source=text(input.revision);
  for(const candidate of input.candidates){
   const version=candidate.version;if(version.type==='WITHDRAWN')continue;
   const compatible=features(source).development===features(`${version.title??''}\n${version.state}`).development;
   const similarity=compatible && input.duplicateOfRevisionId && candidate.evidenceRevisionIds.includes(input.duplicateOfRevisionId)?1:eventSimilarity(features(source),features(`${version.title??''}\n${version.state}`));
   const gap=Math.abs(Date.parse(input.revision.publishedAt??input.revision.acceptedAt)-Date.parse(candidate.newestAt));
   if(similarity>=best && (gap<=3*86400000 || similarity>=.8 && gap<=14*86400000)){selected=candidate.id;best=similarity+.000001}
  }
  if(selected)return {structuralRelation:'SAME_EVENT',eventId:selected,epistemicEffects:[input.duplicateOfRevisionId?'CORROBORATES':'ADDS_DETAIL'],confidence:.6,provenance:lexicalProvenance};
  return {structuralRelation:input.role==='ANALYSIS'?'DEFER':'NEW_STORYLINE',epistemicEffects:input.role==='ANALYSIS'?[]:['CHANGES_STATE'],confidence:.6,provenance:lexicalProvenance};
 }
}
export class LexicalStorylineMatcher implements StorylineMatcher {
 match(input:StorylineMatchInput):StorylineMatchDecision {
  const event=input.event;
  for(const candidate of input.candidates){
   const same=candidate.events.some(e=>e.eventId===event.eventId);
   const topical=event.type!=='WITHDRAWN' && candidate.events.some(e=>e.type!=='WITHDRAWN' && overlap(features(`${e.title??''} ${e.state}`).keywords,features(`${event.title??''} ${event.state}`).keywords)>=.4 && (e.entities.some(x=>event.entities.includes(x)) || overlap(features(e.state).keywords,features(event.state).keywords)>=.7));
   if(same || topical)return {relation:'CONTINUES',storylineId:candidate.id,confidence:.6,provenance:lexicalProvenance};
  }
  return {relation:event.type==='WITHDRAWN'?'DEFER':'NEW',confidence:.6,provenance:lexicalProvenance};
 }
}
export const deterministicMatchers:IntelligenceMatchers={event:new LexicalEventMatcher(),storyline:new LexicalStorylineMatcher()};
