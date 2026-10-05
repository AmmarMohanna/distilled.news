import {it,expect} from 'vitest';
import {writerWire,verificationWire} from './writer-wire';
import type {SynthesisWriterInput} from './publication';
const input={feed:{id:'feed',revision:1,title:'Title',interests:[],outputLanguage:'en'},selectionId:'selection',stories:[{candidate:{id:'canonical',targetType:'EVENT',targetVersionId:'version'},plan:{mustIncludeFactIds:['a'],attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[],treatment:'BRIEF'},approvedFacts:[{id:'a',text:'Officials reported a successful launch.',support:[{evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'}]}],approvedSpans:[{evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'}],evidence:[{id:'revision',body:'Officials reported a successful launch.',language:'en'}]}]} as unknown as SynthesisWriterInput;
it('makes required facts explicit and maps only offered story-scoped exact support and fact IDs',()=>{
 const wire=writerWire(input);
 expect(wire.payload.stories[0].approvedFacts?.[0]).toMatchObject({factId:'fact_1_1',mustInclude:true});
 const raw={language:'en',stories:[{storyId:'story_1',claims:[{text:'Officials reported that the launch succeeded.',supportIds:['span_1_1'],communicatedFactIds:['fact_1_1']}]}]};
 expect(wire.decode(raw).stories[0]).toMatchObject({candidateId:'canonical',claims:[{support:[{evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'}],communicatedFactIds:['a']}]});
 expect(()=>wire.decode({...raw,stories:[{...raw.stories[0],claims:[{...raw.stories[0].claims[0],supportIds:['unknown']}]}]})).toThrow('UNRECOGNIZED_SUPPORT_ID');
 expect(()=>wire.decode({...raw,stories:[{...raw.stories[0],claims:[{...raw.stories[0].claims[0],communicatedFactIds:['unknown']}]}]})).toThrow('UNRECOGNIZED_FACT_ID');
});
it('repair uses the original restricted corpus and exact feedback without adding source material',()=>{
 const wire=writerWire(input),draft=wire.decode({language:'en',stories:[{storyId:'story_1',claims:[{text:'Missing fact.',supportIds:['span_1_1'],communicatedFactIds:[]}]}]});
 const repair=wire.repair(draft,{id:'feedback',feedId:'feed',selectionId:'selection',draftId:'draft',issues:[{code:'MISSING_REQUIRED_FACT',candidateId:'canonical',factId:'a'}],missingFactIds:['a'],createdAt:'2026-10-05T00:00:00Z'});
 expect(repair.input).toEqual(wire.payload);expect(repair.feedback).toEqual([{code:'MISSING_REQUIRED_FACT',candidateId:'story_1',factId:'fact_1_1'}]);
});
it('deduplicates verifier context without dropping constraints and validates offered verdict IDs',()=>{
 const claim={candidateId:'candidate',text:'A fact',support:[{evidenceRevisionId:'r',quote:'A fact'}],context:[{evidenceRevisionId:'r',text:'A fact plus broader context',truncated:false}],requiredFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}],allowedFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}],newUnderstandingFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}]};
 const wire=verificationWire([{...claim,id:'a'},{...claim,id:'b'}]);
 expect(wire.payload.stories[0].facts).toHaveLength(1);expect(wire.payload.stories[0].context).toHaveLength(1);expect(wire.payload.stories[0].requiredFactIds).toEqual(['fact_1']);
 expect(wire.decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1'],novelFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Equivalent meaning.'}]})).toMatchObject({supportedClaimIds:['a','b'],preservedFactIds:['fact'],novelFactIds:['fact']});
 expect(wire.decode({preservedFactIds:['fact_1']})).toMatchObject({preservedFactIds:[]});
 expect(wire.decode({preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:false,temporal:true,qualifiers:true,reason:'Uncertainty became certainty.'}]})).toMatchObject({preservedFactIds:[]});
 expect(()=>wire.decode({supportedClaimIds:['unknown']})).toThrow('UNRECOGNIZED_VERIFIER_ID');
 expect(()=>wire.decode({addressedCorrectionObligationIds:['unoffered']})).toThrow('UNRECOGNIZED_VERIFIER_ID');
});
