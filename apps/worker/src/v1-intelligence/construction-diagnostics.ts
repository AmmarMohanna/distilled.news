export interface ConstructionIssue {code:string;pointer:string;unitId?:string;groupId?:string;observed:unknown;invariant:string;allowed?:string[]}
export class ConstructionContractError extends Error {
 readonly code='CONSTRUCTION_CONTRACT_INVALID';
 constructor(readonly mechanicalIssues:ConstructionIssue[]){super('CONSTRUCTION_CONTRACT_INVALID')}
}
export const pointer=(part:string)=>part.replace(/~/g,'~0').replace(/\//g,'~1');
/** Legacy output is retained as evidence, never converted into a valid decision. */
export function legacyDispositionIssues(raw:Record<string,any>):ConstructionIssue[]{
 const destinations=new Map<string,string[]>();
 const add=(id:string,destination:string)=>destinations.set(id,[...(destinations.get(id)??[]),destination]);
 for(const [i,g] of (Array.isArray(raw.groups)?raw.groups:[]).entries()){if(!g||typeof g!=='object')continue;const ids=Array.isArray(g.claimMentionIds)?g.claimMentionIds:Array.isArray(g.ownedPassages)?g.ownedPassages.map((p:any)=>p?.passageId):[];for(const id of ids)if(typeof id==='string')add(id,g.groupId??'G'+i);}
 for(const id of Array.isArray(raw.backgroundMentionIds)?raw.backgroundMentionIds:[])if(typeof id==='string')add(id,'BACKGROUND');
 return [...destinations].filter(([,v])=>v.length>1).map(([id,values])=>({code:'CONFLICTING_DISPOSITIONS',pointer:'/dispositionByUnitId/'+pointer(id),unitId:id,observed:values,invariant:'Each ClaimMention has exactly one destination.'}));
}
