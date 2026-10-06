import type {EventMatchDecision,IntelligenceMatchers,EventMatchInput} from './matchers';
import {deterministicMatchers,validateEventMatch} from './matchers';
export const SEMANTIC_POLICY='semantic-relations-v2';
export const protectedEffects=new Set(['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS']);
/** Concentration thresholds are engineering escalation guards, not measured
 * semantic accuracy. Construction always needs the structured strong port. */
export function escalationReasons(decision:EventMatchDecision,checks:{forwardEntailment?:number;reverseEntailment?:number}):string[] {
 const reasons:string[]=[];
 if(decision.confidence<.8 || decision.structuralRelation==='DEFER')reasons.push('UNCERTAIN');
 if(checks.forwardEntailment!==undefined && checks.reverseEntailment!==undefined && Math.abs(checks.forwardEntailment-checks.reverseEntailment)>.2)reasons.push('ASYMMETRIC_ENTAILMENT');
 if(decision.epistemicEffects.some(e=>protectedEffects.has(e)))reasons.push('HIGH_CONSEQUENCE');
 if(['NEW_STORYLINE','NEW_EVENT_EXISTING_STORYLINE'].includes(decision.structuralRelation))reasons.push('CONSTRUCTION');return reasons;
}
export interface PreparedSemanticMatch {/** Every current Event id seen at preparation; an Event created since (concurrent arrival) makes the judgment stale. */knownEventIds?:string[];revisionId:string;candidateVersions:Record<string,string>;storylineVersions?:Record<string,string>;decision:EventMatchDecision}
export function preparedMatchers(prepared:PreparedSemanticMatch):IntelligenceMatchers {
 return {event:{match:(input:EventMatchInput)=>{
  if(input.revision.id!==prepared.revisionId || prepared.knownEventIds && input.candidates.some(c=>!prepared.knownEventIds!.includes(c.id)) || Object.entries(prepared.candidateVersions).some(([id,version])=>!input.candidates.some(c=>c.id===id && c.version.id===version)) || Object.entries(prepared.storylineVersions??{}).some(([id,version])=>input.storylineVersions?.[id]!==version))return {structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'STALE_PREPARED_MEMORY'}};
  return validateEventMatch(prepared.decision,input);
 }},storyline:deterministicMatchers.storyline};
}
