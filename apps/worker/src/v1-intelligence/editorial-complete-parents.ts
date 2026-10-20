import type {ShortlistRecord} from './shortlist';
export const COMPLETE_PARENT_POLICY='keyed-complete-parent-decisions-v1';
export const COMPLETE_EDITORIAL_POLICY='evidence-grounded-editorial-keyed-parents-v1';
const obj=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const decision={anyOf:[obj({disposition:{type:'string',enum:['REQUIRED']},reasonCode:{type:'string',enum:['CORE_DEVELOPMENT','MATERIAL_CHANGE','CORRECTION','DISAGREEMENT','NECESSARY_CONTEXT']},justification:{type:'string',minLength:1},obligationIds:{type:'array',items:{type:'string'}}}),obj({disposition:{type:'string',enum:['OPTIONAL_CONTEXT','DEFERRED','NOT_NEWS']},reasonCode:{type:'null'},justification:{type:'string',minLength:1},obligationIds:{type:'array',items:{type:'string'}}})]};
/** Required object slots establish coverage, not correctness of editorial judgment. */
export function completeParentSchema(branches:any[],shortlist:ShortlistRecord){
 return obj(Object.fromEntries(shortlist.candidates.map((c,i)=>['candidate_'+(i+1),{anyOf:branches.map(original=>{const b=structuredClone(original);b.properties.targetVersionId={type:'string',enum:[c.targetVersionId]};delete b.properties.mustIncludeFactIds;b.properties.validation=obj({factDecisions:obj(Object.fromEntries(c.facts.map((_,j)=>['fact_'+(j+1),decision])))});b.required=Object.keys(b.properties);return b})}])));
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
