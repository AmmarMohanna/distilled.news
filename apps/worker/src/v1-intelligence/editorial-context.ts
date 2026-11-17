import type {ShortlistCandidate,ShortlistRecord} from './shortlist';
import type {PlanStory} from './editorial-plan';
/** Context is not Event identity or reader novelty. Another candidate may supply
 * context only through an exact immutable revision already owned by this target. */
export function editorialContextFacts(candidate:ShortlistCandidate,shortlist:Pick<ShortlistRecord,'candidates'>){
 const revisions=new Set(candidate.evidenceRevisionIds),facts=new Map(candidate.facts.map(f=>[f.id,f]));
 for(const other of shortlist.candidates)for(const fact of other.facts)if(!facts.has(fact.id)&&fact.evidenceRevisionIds.some(id=>revisions.has(id))&&['YES','RESOLVED_BY_CONTEXT'].includes(fact.selfContained??''))facts.set(fact.id,fact);
 return [...facts.values()];
}
export function editorialFactReferencesValid(story:PlanStory,candidate:ShortlistCandidate,shortlist:Pick<ShortlistRecord,'candidates'>){
 const owned=new Set(candidate.facts.map(f=>f.id)),context=new Set(editorialContextFacts(candidate,shortlist).map(f=>f.id));
 return [...story.newUnderstandingFactIds,...story.mustIncludeFactIds,...story.attributionFactIds,...story.certaintyFactIds,...story.openQuestionFactIds].every(id=>owned.has(id))&&[...story.contextFactIds,...story.disagreementFactIds].every(id=>context.has(id));
}
