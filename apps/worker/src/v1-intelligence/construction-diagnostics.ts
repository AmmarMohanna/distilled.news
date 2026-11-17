export interface ConstructionIssue {code:string;pointer:string;unitId?:string;groupId?:string;observed:unknown;invariant:string;allowed?:string[]}
export class ConstructionContractError extends Error {
 readonly code='CONSTRUCTION_CONTRACT_INVALID';
 constructor(readonly mechanicalIssues:ConstructionIssue[]){super('CONSTRUCTION_CONTRACT_INVALID')}
}
export const pointer=(part:string)=>part.replace(/~/g,'~0').replace(/\//g,'~1');
/** Mirrors existing canonical annotation checks, collecting all mechanical faults
 * before the single repair. It does not adjudicate factual paraphrases. */
export function annotationIssues(raw:Record<string,any>,texts:Map<string,string>):ConstructionIssue[]{
 const issues:ConstructionIssue[]=[],array=(v:any):any[]=>Array.isArray(v)?v:[];
 for(const [i,g] of array(raw?.groups).entries()){
  if(!g||typeof g!=='object')continue;
  const groupId=g.groupId??'G'+i,owned=raw.dispositionByUnitId&&typeof raw.dispositionByUnitId==='object'?Object.keys(raw.dispositionByUnitId).filter(id=>raw.dispositionByUnitId[id]===groupId):array(g.claimMentionIds??g.ownedPassages?.map((p:any)=>p?.passageId));
  const add=(code:string,path:string,observed:unknown,invariant:string,unitId?:string,allowed?:string[])=>issues.push({code,pointer:`/groups/${i}/${path}`,groupId,observed,invariant,...(unitId?{unitId}:{}),...(allowed?{allowed}:{})});
  const ref=(id:any,path:string)=>{if(typeof id==='string'&&!owned.includes(id))add('FOREIGN_GROUP_REFERENCE',path,id,'Group-local references must use units assigned to this group.',id,owned)};
  for(const [j,e] of array(g.entities).entries()){
   for(const [k,id] of array(e?.claimMentionIds).entries())ref(id,`entities/${j}/claimMentionIds/${k}`);
   const support=array(e?.claimMentionIds).map(id=>texts.get(id)).filter((v):v is string=>typeof v==='string');
   for(const [k,alias] of array(e?.aliases).entries())if(typeof alias==='string'&&support.length&&!support.some(t=>t.includes(alias)))add('ENTITY_ALIAS_NOT_SOURCE',`entities/${j}/aliases/${k}`,alias,'Entity aliases must occur in their supplied source witnesses.');
  }
  const labels=array(g.entities).map(e=>e?.canonicalLabel).filter((v):v is string=>typeof v==='string');
  for(const [j,s] of array(g.slots).entries()){
   if(!s||typeof s!=='object')continue;ref(s.claimMentionId,`slots/${j}/claimMentionId`);
   if(typeof s.entityLabel==='string'&&!labels.includes(s.entityLabel))add('SLOT_ENTITY_OWNERSHIP',`slots/${j}/entityLabel`,s.entityLabel,'A slot may reference only a declared group entity.',s.claimMentionId,labels);
   const text=texts.get(s.claimMentionId);if(text!==undefined){
    if(typeof s.value==='string'&&!text.includes(s.value))add('SLOT_VALUE_NOT_SOURCE',`slots/${j}/value`,s.value,'Slot values must be exact controlled source substrings.',s.claimMentionId);
    if(typeof s.asOf==='string'&&!text.includes(s.asOf))add('SLOT_TIME_NOT_SOURCE',`slots/${j}/asOf`,s.asOf,'Slot timing must occur in its own source witness.',s.claimMentionId);
   }
  }
  for(const [j,id] of array(g.storylineState?.openQuestionMentionIds).entries())ref(id,`storylineState/openQuestionMentionIds/${j}`);
  const date=g.storylineState?.expectedNextDate;if(date&&typeof date==='object'){
   ref(date.claimMentionId,'storylineState/expectedNextDate/claimMentionId');const text=texts.get(date.claimMentionId);
   if(text!==undefined&&typeof date.text==='string'&&!text.includes(date.text))add('STORYLINE_DATE_NOT_SOURCE','storylineState/expectedNextDate/text',date.text,'Date annotation must occur in its own source witness.',date.claimMentionId);
  }
 }
 return issues;
}
/** Legacy output is retained as evidence, never converted into a valid decision. */
export function legacyDispositionIssues(raw:Record<string,any>):ConstructionIssue[]{
 const destinations=new Map<string,string[]>();
 const add=(id:string,destination:string)=>destinations.set(id,[...(destinations.get(id)??[]),destination]);
 for(const [i,g] of (Array.isArray(raw.groups)?raw.groups:[]).entries()){if(!g||typeof g!=='object')continue;const ids=Array.isArray(g.claimMentionIds)?g.claimMentionIds:Array.isArray(g.ownedPassages)?g.ownedPassages.map((p:any)=>p?.passageId):[];for(const id of ids)if(typeof id==='string')add(id,g.groupId??'G'+i);}
 for(const id of Array.isArray(raw.backgroundMentionIds)?raw.backgroundMentionIds:[])if(typeof id==='string')add(id,'BACKGROUND');
 return [...destinations].filter(([,v])=>v.length>1).map(([id,values])=>({code:'CONFLICTING_DISPOSITIONS',pointer:'/dispositionByUnitId/'+pointer(id),unitId:id,observed:values,invariant:'Each ClaimMention has exactly one destination.'}));
}
