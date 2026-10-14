import {editorialContextFacts} from './editorial-context';
import {faithfulFact,hasReaderWitness,type SemanticFactCheck} from './fidelity';
import type {PlanStory} from './editorial-plan';
import type {ShortlistCandidate,ShortlistRecord} from './shortlist';
/** Recover only approved facts with occurrence-bound witnesses in published prose,
 * including context supplied by another Event through the same source revision. */
export function witnessedApprovedHistory(candidate:ShortlistCandidate,shortlist:Pick<ShortlistRecord,'candidates'>,plan:PlanStory|undefined,checks:SemanticFactCheck[],story:{candidateId:string;claims:{id:string;text:string}[]}){
 const approved=new Set(plan?[...plan.newUnderstandingFactIds,...plan.contextFactIds,...plan.mustIncludeFactIds,...plan.attributionFactIds,...plan.certaintyFactIds,...plan.disagreementFactIds,...plan.openQuestionFactIds]:[]);
 return editorialContextFacts(candidate,shortlist).filter(f=>approved.has(f.id)&&checks.some(c=>c.factId===f.id&&(!c.candidateId||c.candidateId===story.candidateId)&&faithfulFact(c)&&hasReaderWitness(c,story.claims)));
}
/** Citation identity supplies reader history, never proof of shared Event identity
 * or proof that every fact in an article was communicated. Callers compare facts. */
export function sharesReaderEvidence(revisionIds:readonly string[],entry:{evidenceRevisionIds?:readonly string[]}):boolean {
 return Boolean(entry.evidenceRevisionIds?.some(id=>revisionIds.includes(id)));
}
export function readerHistoryMatches(candidate:{stableTargetId:string;storylineId?:string;evidenceRevisionIds?:readonly string[]},entry:{eventIds?:readonly string[];storylineIds?:readonly string[];evidenceRevisionIds?:readonly string[];withdrawn?:boolean}):boolean {
 return Boolean(entry.eventIds?.includes(candidate.stableTargetId)||candidate.storylineId&&entry.storylineIds?.includes(candidate.storylineId)||!entry.withdrawn&&sharesReaderEvidence(candidate.evidenceRevisionIds??[],entry));
}
