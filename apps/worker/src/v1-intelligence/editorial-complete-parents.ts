import {compactEditorialInput} from './editorial-transport';
import type {ShortlistRecord} from './shortlist';
export const COMPLETE_PARENT_POLICY='keyed-complete-parent-decisions-v1';
export const COMPLETE_EDITORIAL_POLICY='evidence-grounded-editorial-keyed-parents-v1';
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const completeParentDefinitions={EditorialParentDecision:{anyOf:[obj({disposition:{type:'string',enum:['REQUIRED']},reasonCode:{type:'string',enum:['CORE_DEVELOPMENT','MATERIAL_CHANGE','CORRECTION','DISAGREEMENT','NECESSARY_CONTEXT']},justification:{type:'string',minLength:1},obligationIds:{type:'array',items:{type:'string'}}}),obj({disposition:{type:'string',enum:['OPTIONAL_CONTEXT','DEFERRED','NOT_NEWS']},reasonCode:{type:'null'},justification:{type:'string',minLength:1},obligationIds:{type:'array',items:{type:'string'}}})]}};
/** Required object slots establish coverage, not correctness of editorial judgment. */
export function completeParentSchema(branches:any[],shortlist:ShortlistRecord){
 return obj(Object.fromEntries(shortlist.candidates.map((c,i)=>['candidate_'+(i+1),{anyOf:branches.map(original=>{const b=structuredClone(original);b.properties.targetVersionId={type:'string',enum:[c.targetVersionId]};delete b.properties.mustIncludeFactIds;b.properties.validation=obj({factDecisions:obj(Object.fromEntries(c.facts.map((_,j)=>['fact_'+(j+1),{$ref:'#/$defs/EditorialParentDecision'}])))});b.required=Object.keys(b.properties);return b})}])));
}
function exactKeys(value:any,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('EDITORIAL_PARENT_DECISION_COVERAGE');}
export function decodeCompleteParents(raw:Record<string,unknown>,shortlist:ShortlistRecord):Record<string,unknown>{
 const value=structuredClone(raw) as any;exactKeys(value,['stories','obligations']);exactKeys(value.stories,shortlist.candidates.map((_,i)=>'candidate_'+(i+1)));
 value.stories=shortlist.candidates.map((candidate,i)=>{
  const story=value.stories['candidate_'+(i+1)];if(!story||story.targetVersionId!==candidate.targetVersionId||'mustIncludeFactIds' in story)throw Error('EDITORIAL_CANDIDATE_COVERAGE');
  exactKeys(story.validation,['factDecisions']);const decisions=story.validation.factDecisions;exactKeys(decisions,candidate.facts.map((_,j)=>'fact_'+(j+1)));
  const propositions=candidate.facts.map((fact,j)=>({id:'parent_'+(j+1),parentFactId:fact.id}));
  const dispositions=propositions.map((p,j)=>{const d=decisions['fact_'+(j+1)];exactKeys(d,['disposition','reasonCode','justification','obligationIds']);return {propositionId:p.id,...d}});
  story.validation={policyVersion:'editorial-requirements-v2',propositions,dispositions};story.mustIncludeFactIds=propositions.filter((_,j)=>dispositions[j].disposition==='REQUIRED').map(p=>p.parentFactId);return story;
 });return value;
}

export const COMPACT_COMPLETE_PARENT_POLICY='keyed-complete-parent-compact-references-v2';
export const COMPACT_COMPLETE_EDITORIAL_POLICY='evidence-grounded-editorial-keyed-parents-v2';
/** Reuse the existing reference capabilities while retaining the complete V2
 * input projection, including source eligibility and every evidence value. */
export function completeParentReferences(shortlist:ShortlistRecord){
 const wire=compactEditorialInput(shortlist),ids=new Set(['id','targetVersionId','stableTargetId','storylineId','obligationId','ledgerEntryId','parentFactId','propositionId','newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds','correctionObligationIds','previousLedgerEntryIds','obligationIds','eventIds','storylineIds']);
 const transform=(value:any,decode:boolean,key=''):any=>{
  if(Array.isArray(value))return value.map(v=>transform(v,decode,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v,decode,k)]));
  if(typeof value==='string'&&ids.has(key)){const mapped=decode?wire.decodeReference(value):wire.encodeReference(value);if(decode&&!mapped)throw Error('EDITORIAL_REFERENCE_OWNERSHIP');return mapped??value}
  return value;
 };
 const schema=(value:any):any=>Array.isArray(value)?value.map(schema):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,k==='enum'&&Array.isArray(v)?v.map(x=>typeof x==='string'?wire.encodeReference(x)??x:x):schema(v)])):value;
 return {encode:(value:any)=>transform(value,false),decode:(value:any)=>transform(value,true),schema};
}
