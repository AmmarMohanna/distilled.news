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

/** Candidates that validation forbids selecting until durable reassessment completes. */
export const planningBlockedFlags=['TITLE_EXTRACTION_PENDING','IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE'];
type Costed=Pick<ShortlistCandidate,'facts'|'evidenceRevisionIds'|'flags'> & {communicationCost?:CommunicationCost};
const costOf=(c:Costed)=>c.communicationCost??communicationCost(c);
export const selectableForPlanning=(c:Pick<ShortlistCandidate,'flags'>)=>!c.flags.some(f=>planningBlockedFlags.includes(f));

/** Sound upper bound on how many selectable candidates can ever be published together.
 * The cheapest-first prefix maximizes cardinality for the input allowance, so no combination
 * larger than this fits; unlike the former most-expensive-first prefix it never rules out
 * several cheap stories because some other candidate is expensive. It is a ceiling, not a target. */
export function storyCapacityBound(candidates:Costed[],budget:BriefingBudget):number {
 const capacity=planningCapacity(budget),costs=candidates.filter(selectableForPlanning).map(c=>costOf(c).inputUnits).filter(n=>n<=capacity.maxInputUnits).sort((a,b)=>a-b);let used=0,count=0;
 for(const cost of costs){if(count>=budget.maxStories||used+cost>capacity.maxInputUnits)break;used+=cost;count++}return count;
}
/** Number of the given candidates that provably fit together (cheapest first, BRIEF treatment, all hard
 * dimensions). A lower bound: a feasible set of this size exists. Used for correction obligations. */
export function guaranteedStoryCount(candidates:Costed[],budget:BriefingBudget):number {
 const capacity=planningCapacity(budget);let input=0,evidence=0,words=0,count=0;
 for(const c of candidates.filter(selectableForPlanning).map(costOf).sort((a,b)=>a.inputUnits-b.inputUnits)){
  if(count>=capacity.maxStories||input+c.inputUnits>capacity.maxInputUnits||evidence+c.evidenceCount>capacity.maxEvidenceInspections||words+c.briefWords>capacity.maxReadingWords)continue;
  input+=c.inputUnits;evidence+=c.evidenceCount;words+=c.briefWords;count++;
 }
 return count;
}

export interface SelectionItem {id:string;cost:CommunicationCost;treatment:'BRIEF'|'STANDARD'|'DETAILED';publisherIds:string[];protectedItem:boolean;order:number;value:number}
export type CapacityReason='STORY_CAPACITY'|'INPUT_CAPACITY'|'EVIDENCE_CAPACITY'|'WORD_CAPACITY'|'PUBLISHER_CAPACITY';
export const itemWords=(i:Pick<SelectionItem,'cost'|'treatment'>)=>i.treatment==='DETAILED'?i.cost.detailedWords:i.treatment==='STANDARD'?i.cost.standardWords:i.cost.briefWords;
interface Usage {stories:number;input:number;evidence:number;words:number;publishers:Map<string,number>}
const emptyUsage=():Usage=>({stories:0,input:0,evidence:0,words:0,publishers:new Map()}),cloneUsage=(u:Usage):Usage=>({...u,publishers:new Map(u.publishers)});
/** The single admission rule shared by plan validation, deterministic allocation and tests. Publisher rule mirrors ordinary selection:
 * a story is refused when any of its publishers already supplies maxPerPublisher selected stories. */
export function capacityReason(u:Usage,i:SelectionItem,budget:BriefingBudget):CapacityReason|undefined {
 const capacity=planningCapacity(budget);
 return u.stories>=capacity.maxStories?'STORY_CAPACITY':u.input+i.cost.inputUnits>capacity.maxInputUnits?'INPUT_CAPACITY':u.evidence+i.cost.evidenceCount>capacity.maxEvidenceInspections?'EVIDENCE_CAPACITY':u.words+itemWords(i)>capacity.maxReadingWords?'WORD_CAPACITY':i.publisherIds.some(p=>(u.publishers.get(p)??0)>=budget.maxPerPublisher)?'PUBLISHER_CAPACITY':undefined;
}
function admit(u:Usage,i:SelectionItem){u.stories++;u.input+=i.cost.inputUnits;u.evidence+=i.cost.evidenceCount;u.words+=itemWords(i);for(const p of new Set(i.publisherIds))u.publishers.set(p,(u.publishers.get(p)??0)+1)}
export const EXHAUSTIVE_SELECTION_LIMIT=16;
/** Choose which planner-SELECTed stories fit together. Protected work is allocated first, in editorial order, and can never be
 * displaced by ordinary news. Ordinary stories then take the feasible combination with the greatest total editorial value
 * (ties: more stories, then earlier planner order), so one expensive story is not preferred over several cheaper, jointly
 * more valuable ones. It never adds a story the planner did not select. Beyond the exhaustive limit it degrades to planner order. */
export function allocateFeasibleSelection(items:SelectionItem[],budget:BriefingBudget):{accepted:Set<string>;rejected:Map<string,CapacityReason>} {
 const accepted=new Set<string>(),rejected=new Map<string,CapacityReason>(),usage=emptyUsage();
 for(const i of items.filter(i=>i.protectedItem).sort((a,b)=>a.order-b.order)){const reason=capacityReason(usage,i,budget);if(reason)rejected.set(i.id,reason);else{admit(usage,i);accepted.add(i.id)}}
 const ordinary=items.filter(i=>!i.protectedItem).sort((a,b)=>a.order-b.order);
 let best:SelectionItem[]=[];
 if(ordinary.length<=EXHAUSTIVE_SELECTION_LIMIT){
  let bestValue=-1,bestOrder=Infinity;
  const walk=(index:number,u:Usage,chosen:SelectionItem[],value:number)=>{
   if(index===ordinary.length){const orderSum=chosen.reduce((n,i)=>n+i.order,0);if(value>bestValue+1e-9||Math.abs(value-bestValue)<=1e-9&&(chosen.length>best.length||chosen.length===best.length&&orderSum<bestOrder)){best=[...chosen];bestValue=value;bestOrder=orderSum}return}
   const item=ordinary[index];
   if(!capacityReason(u,item,budget)){const next=cloneUsage(u);admit(next,item);walk(index+1,next,[...chosen,item],value+Math.max(1e-6,item.value))}
   walk(index+1,u,chosen,value);
  };
  walk(0,usage,[],0);
 }else{const u=cloneUsage(usage);for(const i of ordinary)if(!capacityReason(u,i,budget)){admit(u,i);best.push(i)}}
 const chosen=new Set(best.map(i=>i.id)),final=cloneUsage(usage);
 for(const i of ordinary){if(chosen.has(i.id)){admit(final,i);accepted.add(i.id)}}
 // Report the first hard dimension that excludes each rejected story against what was actually admitted.
 for(const i of ordinary)if(!chosen.has(i.id))rejected.set(i.id,capacityReason(final,i,budget)??'INPUT_CAPACITY');
 return {accepted,rejected};
}

/** The former estimate (most expensive candidates first). It under-counts what fits and is retained ONLY to reproduce the exact input of a
 * planner call that was already reserved or answered under it, so billed results are reused and unknown outcomes stay fenced. */
export function legacyConservativeStoryCapacity(candidates:Pick<ShortlistCandidate,'facts'|'evidenceRevisionIds'|'communicationCost'>[],budget:BriefingBudget):number {
 const capacity=planningCapacity(budget),costs=candidates.map(c=>(c.communicationCost??communicationCost(c)).inputUnits).filter(n=>n<=capacity.maxInputUnits).sort((a,b)=>b-a);let used=0,count=0;
 for(const cost of costs){if(count>=budget.maxStories||used+cost>capacity.maxInputUnits)break;used+=cost;count++}return count;
}
