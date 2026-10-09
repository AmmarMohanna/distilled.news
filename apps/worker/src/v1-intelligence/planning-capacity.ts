import type {ShortlistCandidate} from './shortlist';
import type {BriefingBudget} from './scoring';
export interface CommunicationCost {inputUnits:number;evidenceCount:number;briefWords:number;standardWords:number;detailedWords:number}
/** Byte-based conservative upper bounds deliberately match the existing admission guard.
 * Include repeated fact/support metadata, writer and verifier overhead, rather than treating prose length as input size. */
export function communicationCost(c:Pick<ShortlistCandidate,'facts'|'evidenceRevisionIds'>):CommunicationCost {
 const bytes=new TextEncoder().encode(JSON.stringify(c.facts)).length;
 return {inputUnits:1200+bytes*2,evidenceCount:new Set(c.facts.flatMap(f=>f.evidenceRevisionIds)).size||c.evidenceRevisionIds.length,briefWords:Math.max(40,c.facts.length*20),standardWords:Math.max(100,c.facts.length*25),detailedWords:Math.max(180,c.facts.length*30)};
}
export function planningCapacity(budget:BriefingBudget){return {maxStories:budget.maxStories,maxReadingWords:budget.maxReadingWords,maxEvidenceInspections:budget.maxEvidenceInspections,maxInputUnits:Math.max(0,budget.maxInputTokens-4000),inputUnit:'conservative UTF-8 byte upper bound',fixedInputReserve:4000,maxOutputTokens:budget.maxOutputTokens};}

/** A cardinality bound the model can follow without arithmetic: any subset up
 * to this size fits the conservative input estimate. Expensive candidates stay
 * in the shortlist and may use a whole slot; they are not relevance-filtered. */
export function conservativeStoryCapacity(candidates:ShortlistCandidate[],budget:BriefingBudget):number {
 const capacity=planningCapacity(budget),costs=candidates.map(c=>(c.communicationCost??communicationCost(c)).inputUnits).filter(n=>n<=capacity.maxInputUnits).sort((a,b)=>b-a);let used=0,count=0;
 for(const cost of costs){if(count>=budget.maxStories||used+cost>capacity.maxInputUnits)break;used+=cost;count++}return count;
}
