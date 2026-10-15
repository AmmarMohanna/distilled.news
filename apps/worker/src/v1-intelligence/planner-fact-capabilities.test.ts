import {it,expect} from 'vitest';
import {compactEditorialInput} from './editorial-transport';
import {keyedEditorialPlanWireSchemaFor} from './editorial-plan';
import {expandedSchema} from './schema-test-utils';
import {inspectProviderSchema} from '../provider-schema';
const candidate=(id:string,source:string)=>({targetType:'EVENT',targetVersionId:id,stableTargetId:id+'-event',evidenceRevisionIds:[source],facts:[{id:id+'-fact',text:id+' reported a development.',evidenceRevisionIds:[source],claimMentionIds:[id+'-mention'],selfContained:'YES'}],flags:[],effects:[],protectedReasons:[],correctionObligationIds:[],priority:.8});
it.each([40,100,120])('%i equivalent source-context capabilities share enums regardless of candidate-first ordering',count=>{
 const state:any={candidates:Array.from({length:count},(_,i)=>candidate('candidate-'+i,'shared-article')),ledger:[],obligations:[]},wire=compactEditorialInput(state),schema=keyedEditorialPlanWireSchemaFor(wire.state,wire.contextFactCapabilities),admission=inspectProviderSchema('openai/gpt-4.1-mini',schema);
 expect(admission.fits,JSON.stringify(admission)).toBe(true);
 const expanded=expandedSchema(schema) as any;
 for(const c of wire.state.candidates)for(const branch of expanded.properties.stories.properties[c.targetVersionId].anyOf.filter((b:any)=>b.properties.decision.enum.includes('SELECT'))){
  expect(new Set(branch.properties.contextFactIds.items.enum)).toEqual(new Set(wire.state.candidates.flatMap((c:{facts:{id:string}[]})=>c.facts.map(f=>f.id))));
  expect(branch.properties.mustIncludeFactIds.items.enum).toEqual(c.facts.map((f:{id:string})=>f.id));
 }
});
function branches(shared:boolean,unresolved=false){const state:any={candidates:[candidate('one','source-one'),candidate('two',shared?'source-one':'source-two')],ledger:[],obligations:[]};if(unresolved)state.candidates[1].facts[0].selfContained='UNRESOLVED';const wire=compactEditorialInput(state);const schema=expandedSchema(keyedEditorialPlanWireSchemaFor(wire.state,wire.contextFactCapabilities)) as any;return {branches:schema.properties.stories.properties[wire.state.candidates[0].targetVersionId].anyOf,own:wire.state.candidates[0].facts[0].id,other:wire.state.candidates[1].facts[0].id,wire}}
it('unrelated context cannot be offered by the keyed schema (retained Tech Now failure)',()=>{const x=branches(false);for(const b of x.branches)expect(b.properties.contextFactIds.items.enum??[]).not.toContain(x.other)});
it('every primary fact role is bound to its candidate even when contextual evidence is shared',()=>{const x=branches(true);for(const b of x.branches.filter((b:any)=>b.properties.decision.enum.includes('SELECT')))for(const role of ['newUnderstandingFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','openQuestionFactIds'])expect(b.properties[role].items.enum).toEqual([x.own])});
it('legitimate shared-source context and disagreement remain available',()=>{const x=branches(true);for(const b of x.branches.filter((b:any)=>b.properties.decision.enum.includes('SELECT')))for(const role of ['contextFactIds','disagreementFactIds'])expect(b.properties[role].items.enum).toEqual([x.own,x.other])});
it('unresolved foreign facts cannot become approved contextual support',()=>{const x=branches(true,true);for(const b of x.branches.filter((b:any)=>b.properties.decision.enum.includes('SELECT')))expect(b.properties.contextFactIds.items.enum).toEqual([x.own])});

it('deferred facts stay in the input while inactive publication-role references are structurally empty',()=>{const x=branches(false);expect(x.wire.state.candidates.flatMap((c:any)=>c.facts)).toHaveLength(2);for(const b of x.branches.filter((b:any)=>!b.properties.decision.enum.includes('SELECT')))for(const role of ['contextFactIds','newUnderstandingFactIds','mustIncludeFactIds'])expect(b.properties[role].maxItems).toBe(0)});
