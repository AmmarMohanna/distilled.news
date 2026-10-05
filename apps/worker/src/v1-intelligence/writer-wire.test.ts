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
 expect(wire.decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1'],novelFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Equivalent meaning.',readerSpans:[{claimId:'claim_1',text:'A fact'}]}]})).toMatchObject({supportedClaimIds:['a','b'],preservedFactIds:['fact'],novelFactIds:['fact']});
 expect(()=>wire.decode({preservedFactIds:['fact_1']})).toThrow('INCOMPLETE_SEMANTIC_VERDICT');
 expect(wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:false,temporal:true,qualifiers:true,reason:'Uncertainty became certainty.',readerSpans:[{claimId:'claim_1',text:'A fact'}]}]})).toMatchObject({preservedFactIds:[]});
 const semanticChecks=[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Equivalent meaning.',readerSpans:[{claimId:'claim_1',text:'A fact'}]}];
 expect(()=>wire.decode({supportedClaimIds:['unknown'],semanticChecks})).toThrow('UNRECOGNIZED_VERIFIER_ID');
 expect(()=>wire.decode({supportedClaimIds:['claim_1'],addressedCorrectionObligationIds:['unoffered'],semanticChecks})).toThrow('UNRECOGNIZED_VERIFIER_ID');
});
it('offers merged approved spans once with retained publisher identity and no extra provenance fields in decoded citations',()=>{
 const supplied=structuredClone(input);supplied.stories[0].evidence[0].publisherId='original-publisher';
 supplied.stories[0].approvedSpans=[{evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'}];
 const wire=writerWire(supplied);expect(wire.payload.stories[0].supportSpans).toHaveLength(1);
 expect(wire.payload.stories[0].supportSpans[0].publisherId).toBe('original-publisher');
 expect(wire.decode({language:'en',stories:[{storyId:'story_1',claims:[{text:'The launch succeeded, officials reported.',supportIds:['span_1_1'],communicatedFactIds:['fact_1_1']}]}]}).stories[0].claims[0].support[0]).toEqual({evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'});
});
it('requires coverage witnesses in actual supported reader prose, never source-only text or another story',()=>{
 const claim={id:'a',candidateId:'story-a',text:'The minister stepped down.',support:[{evidenceRevisionId:'r',quote:'The minister resigned.'}],context:[],requiredFacts:[{id:'f',text:'The minister resigned.',evidenceRevisionIds:['r']}]};
 const wire=verificationWire([claim,{...claim,id:'b',candidateId:'story-b',requiredFacts:[]}]);
 const check={factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Resigned and stepped down are equivalent.'};
 const verdict=(readerSpans:{claimId:string;text:string}[])=>({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1'],semanticChecks:[{...check,readerSpans}]});
 expect(wire.decode(verdict([{claimId:'claim_1',text:'The minister stepped down.'}])).preservedFactIds).toEqual(['f']);
 expect(wire.decode(verdict([{claimId:'claim_1',text:'The minister resigned.'}])).semanticChecks[0]).toMatchObject({communicated:false,reason:expect.stringContaining('INVALID_READER_WITNESS')});
 expect(wire.decode(verdict([{claimId:'claim_2',text:'The minister stepped down.'}])).preservedFactIds).toEqual([]);
 expect(wire.decode(verdict([])).semanticChecks[0]).toMatchObject({communicated:false,reason:expect.stringContaining('MISSING_READER_WITNESS')});
 expect(wire.decode({...verdict([{claimId:'claim_1',text:'The minister stepped down.'}]),supportedClaimIds:[]}).preservedFactIds).toEqual([]);
});
