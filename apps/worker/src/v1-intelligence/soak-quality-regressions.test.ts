import {expect,it} from 'vitest';
import planner from './fixtures/staging-planner-reference-categories.json';
import construction from './fixtures/staging-construction-slot.json';
import quantity from './fixtures/staging-approximate-quantity.json';
import {compactEditorialInput} from './editorial-transport';
import {editorialPlanWireSchemaFor,validateEditorialPlan,type EditorialPlanBody} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
import {parseConstruction} from './semantic-construction';
import type {ClaimMention} from './claims';
import {checkReaderFidelity} from './fidelity';
import {inspectWriterDraft} from './writer-feedback';
import type {SynthesisInput} from './publication';
import {assessSelfContainment} from './self-contained';

it('the persisted planner attempt cannot use ledger history as approved fact context',()=>{
 const shortlist=planner.shortlist as unknown as ShortlistRecord;
 expect(()=>validateEditorialPlan(planner.invalidPlan as EditorialPlanBody,shortlist)).toThrow();
 const transport=compactEditorialInput(shortlist),schema=editorialPlanWireSchemaFor(transport.state);
 const branch=schema.properties.stories.items.anyOf[0].properties as unknown as Record<string,{items?:{enum?:string[]}}>;
 const ledger=transport.state.ledger.map(e=>e.id),facts=transport.state.candidates.flatMap(c=>c.facts.map(f=>f.id));
 expect(branch.contextFactIds.items!.enum).toEqual([...new Set(facts)]);
 expect(branch.previousLedgerEntryIds.items!.enum).toEqual(ledger);
 expect(branch.contextFactIds.items!.enum!.some(id=>ledger.includes(id))).toBe(false);
});
it('the exact construction cannot invent slot values; TEXT preserves the whole fact',()=>{
 const mention=construction.mention as ClaimMention,input={candidates:[],storylines:[]} as any;
 expect(()=>parseConstruction(construction.invalidConstruction,[mention],input,{scorer:'GPT',policyVersion:'test'})).toThrow();
 const corrected=structuredClone(construction.invalidConstruction);corrected.groups[0].slots=[];corrected.backgroundMentionIds=[];
 const accepted=parseConstruction(corrected,[mention],input,{scorer:'GPT',policyVersion:'test'});
 expect(accepted.groups[0].claimMentionIds).toEqual([mention.id]);expect(accepted.groups[0].entities).toEqual(corrected.groups[0].entities);
});
it('a positive semantic attestation cannot erase a supplied approximate magnitude',()=>{
 const fact={id:'f',text:quantity.sourceText,evidenceRevisionIds:['r']};
 const checks=[{factId:'f',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Model approved'}];
 expect(checkReaderFidelity([quantity.badClaim],[fact],[fact],true,{checks}).failures).toContainEqual({code:'LOST_QUANTITY',factId:'f',value:'dozens'});
 expect(checkReaderFidelity(['Dozens of people reportedly received unusual ASOS app notifications.'],[fact],[fact],true,{checks}).passed).toBe(true);
});
it('en-gb evidence receives the same writer precheck as English',()=>{
 const fact={id:'f',text:quantity.sourceText,evidenceRevisionIds:['r']},input={feed:{outputLanguage:'en'},stories:[{candidate:{id:'c'},evidence:[{id:'r',language:quantity.language}],plan:{facts:[fact],mustIncludeFactIds:['f'],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]}}]} as unknown as SynthesisInput;
 const spans=[{evidenceRevisionId:'r',quote:quantity.sourceText}];
 expect(inspectWriterDraft(input,{language:'en',stories:[{candidateId:'c',claims:[{text:quantity.badClaim,support:spans}]}]},()=>spans,true)).toContainEqual({code:'LOST_QUANTITY',candidateId:'c',factId:'f',value:'dozens'});
});
it('embedded descriptive possessives need context from their own evidence, not guessed names',()=>{
 expect(assessSelfContainment(quantity.sourceText,[{id:'r',language:quantity.language,title:quantity.title}])).toMatchObject({status:'RESOLVED_BY_CONTEXT',context:{text:quantity.title}});
 expect(assessSelfContainment(quantity.sourceText,[{id:'r',language:quantity.language,title:'Daily retail roundup'}]).status).toBe('UNRESOLVED');
 expect(assessSelfContainment('Dozens of people received an ASOS app notification.',[{id:'r',language:'en',title:quantity.title}]).status).toBe('YES');
});
