import {expect,it} from 'vitest';
import planner from './fixtures/staging-planner-reference-categories.json';
import construction from './fixtures/staging-construction-slot.json';
import quantity from './fixtures/staging-approximate-quantity.json';
import deferredCorrection from './fixtures/staging-deferred-correction.json';
import {compactEditorialInput} from './editorial-transport';
import {editorialPlanWireSchemaFor,validateEditorialPlan,fallbackEditorialPlan,type EditorialPlanBody} from './editorial-plan';
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
it('cannot select the observed withdrawn target while deferring its correction obligation',()=>{
 const shortlist=deferredCorrection.shortlist as unknown as ShortlistRecord;
 expect(()=>validateEditorialPlan(deferredCorrection.plan as EditorialPlanBody,shortlist)).toThrow();
 const fallback=fallbackEditorialPlan(shortlist);
 expect(fallback.stories.filter(s=>shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!.correctionObligationIds.length).every(s=>s.decision==='DEFER')).toBe(true);
 expect(validateEditorialPlan(fallback,shortlist)).toEqual(fallback);
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
it('the observed award and merger facts offer the missing object and participants from exact titles',()=>{
 const award={id:'r',language:'en-gb',title:"'Ghost particles' from space telescope wins physics Nobel"};
 expect(assessSelfContainment('Belgian physicist Prof Francis Halzen has won for his pioneering work on an observatory that detects particles from space.',[award])).toMatchObject({status:'RESOLVED_BY_CONTEXT',context:{text:award.title}});
 expect(assessSelfContainment('Professor Halzen has won a physics prize for his work.',[award]).status).toBe('YES');
 const merger={id:'m',language:'en-gb',title:'Paramount takes over Warner Bros in $110bn Hollywood merger'};
 expect(assessSelfContainment("The merger of two of Hollywood's biggest movie studios comes after months of legal disputes and concern over competition.",[merger])).toMatchObject({status:'RESOLVED_BY_CONTEXT',context:{text:merger.title}});
 expect(assessSelfContainment('Professor Halzen has won for his work.',[{...award,title:'Science roundup'}]).status).toBe('UNRESOLVED');
});
it('accepts the exact approved headline amount in natural expanded units, never an unsupported amount',()=>{
 const fact={id:'f',text:'The merger of two studios comes after months of legal disputes.',evidenceRevisionIds:['r'],context:{text:'Paramount takes over Warner Bros in $110bn Hollywood merger'}};
 expect(checkReaderFidelity(['Paramount has taken over Warner Bros in a $110 billion merger combining two studios after months of legal disputes.'],[fact],[fact],true).passed).toBe(true);
 expect(checkReaderFidelity(['Paramount has taken over Warner Bros in a $120 billion merger.'],[fact],[fact],true).failures).toContainEqual({code:'UNSUPPORTED_QUANTITY',value:'120000000000'});
 expect(checkReaderFidelity(['The merger was worth $110 billion.'],[{...fact,context:undefined}],[{...fact,context:undefined}],true).passed).toBe(false);
});
it('the observed $300m financing expands to millions without treating a distance m as money',()=>{
 const fact={id:'f',text:'LIV Golf secures a possible $300m in financing from BC Partners Credit in order to emerge from restructuring before the 2027 season.',evidenceRevisionIds:['r']};
 expect(checkReaderFidelity(['LIV Golf has secured possible financing of $300 million from BC Partners Credit to emerge from restructuring before the 2027 season.'],[fact],[fact],true).passed).toBe(true);
 expect(checkReaderFidelity(['The route is 300 million metres long.'],[{id:'d',text:'The route is 300m long.',evidenceRevisionIds:['r']}],[{id:'d',text:'The route is 300m long.',evidenceRevisionIds:['r']}],true).passed).toBe(false);
});
it('the observed generic regulator and sentenced person need their own supported source context',()=>{
 const regulator={id:'r',language:'en-gb',title:'Ofcom investigates Meta over Instagram Instants feature'};
 expect(assessSelfContainment('The regulator said Instagram had not fully assessed risks posed by its Instants feature prior to launching it.',[regulator])).toMatchObject({status:'RESOLVED_BY_CONTEXT',context:{text:regulator.title}});
 const fraud={id:'f',language:'en-gb',title:"Lego fraudster among last year's most high-profile insurance scammers"};
 expect(assessSelfContainment('The person was sentenced to 28 months in prison after an investigation found the claims were made up, the insurance trade body, the ABI said.',[fraud])).toMatchObject({status:'RESOLVED_BY_CONTEXT',context:{text:fraud.title}});
 expect(assessSelfContainment('The person was sentenced to 28 months in prison.',[{...fraud,title:''}]).status).toBe('UNRESOLVED');
});
