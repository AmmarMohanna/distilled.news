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

it('retains actual prior reader prose and publication withdrawal context in compact writer and verifier inputs',()=>{
 const supplied=structuredClone(input),history={id:'ledger',claimText:'The launch caused a collapse.',claimFacts:['Officials reported a successful launch.'],editionId:'old',eventIds:[],storylineIds:[],certainty:{kind:'UNSPECIFIED',hedges:[]}};
 supplied.stories[0].plan!.previousLedgerEntries=[history];
 supplied.stories[0].plan!.correctionObligations=[{id:'ob',feedId:'feed',ledgerEntryId:'ledger',editionId:'old',kind:'RETRACTED',triggerId:'withdrawal',state:'OPEN',createdAt:'2026-10-06T00:00:00Z',policyVersion:'test',publicationWithdrawal:{reason:'POLICY_REQUIRED'}}];
 const wire=writerWire(supplied);
 expect(wire.payload.stories[0].previousLedgerEntries).toEqual([{claimText:history.claimText,claimFacts:undefined}]);
 expect(wire.payload.stories[0].correctionObligations).toEqual([{kind:'RETRACTED',publicationWithdrawal:true}]);
 expect(wire.payload.stories[0].approvedFacts?.[0].text).toBe('Officials reported a successful launch.');
 expect(JSON.stringify(wire.payload)).not.toContain('POLICY_REQUIRED');
 const corrected=wire.decode({language:'en',stories:[{storyId:'story_1',correctionAcknowledgment:'A prior Distilled briefing was withdrawn.',claims:[{text:'Officials reported a successful launch.',supportIds:['span_1_1'],communicatedFactIds:['fact_1_1']}]}]});
 expect(corrected.stories[0].claims[0].text).toBe('A prior Distilled briefing was withdrawn. Officials reported a successful launch.');
 expect(corrected.stories[0].claims[0].support).toEqual([{evidenceRevisionId:'revision',quote:'Officials reported a successful launch.'}]);
 const verifier=verificationWire([{id:'claim',text:'Corrected launch report.',support:[],context:[],previousReaderClaims:[history],correctionObligations:supplied.stories[0].plan!.correctionObligations}]);
 expect(verifier.payload.stories[0].previousReaderClaims).toEqual([{id:'prior_1',claimText:history.claimText}]);
 expect(verifier.payload.stories[0].correctionObligations[0]).toMatchObject({id:'correction_1',ledgerEntryId:'prior_1'});
 expect(verifier.decode({supportedClaimIds:['claim_1'],semanticChecks:[],addressedCorrectionObligationIds:['correction_1']})).toMatchObject({addressedCorrectionObligationIds:['ob']});
 expect(()=>verifier.decode({semanticChecks:[],addressedCorrectionObligationIds:['foreign-correction']})).toThrow('UNRECOGNIZED_VERIFIER_ID');
});
it('repair uses the original restricted corpus and exact feedback without adding source material',()=>{
 const wire=writerWire(input),draft=wire.decode({language:'en',stories:[{storyId:'story_1',claims:[{text:'Missing fact.',supportIds:['span_1_1'],communicatedFactIds:[]}]}]});
 const repair=wire.repair(draft,{id:'feedback',feedId:'feed',selectionId:'selection',draftId:'draft',issues:[{code:'MISSING_REQUIRED_FACT',candidateId:'canonical',factId:'a'}],missingFactIds:['a'],createdAt:'2026-10-05T00:00:00Z'});
 expect(repair.input).toEqual(wire.payload);expect(repair.feedback).toEqual([{code:'MISSING_REQUIRED_FACT',candidateId:'story_1',factId:'fact_1_1'}]);
});
it('deduplicates verifier context without dropping constraints and validates offered verdict IDs',()=>{
 const claim={candidateId:'candidate',text:'A fact',support:[{evidenceRevisionId:'r',quote:'A fact'}],context:[{evidenceRevisionId:'r',text:'A fact plus broader context',truncated:false}],requiredFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}],allowedFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}],newUnderstandingFacts:[{id:'fact',text:'A fact',evidenceRevisionIds:['r']}]};
 const wire=verificationWire([{...claim,id:'a'},{...claim,id:'b'}]);
 const checks=wire.schema.properties.semanticChecks as {items:{properties:{readerSpans:{items:{additionalProperties:boolean;properties:{claimId:{enum:string[]};text?:unknown}}}}}};
 expect(checks.items.properties.readerSpans.items).toMatchObject({additionalProperties:false,properties:{claimId:{enum:['claim_1','claim_2']}}});
 expect(checks.items.properties.readerSpans.items.properties.text).toBeUndefined();
 const resolved=wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Complete supported prose.',readerSpans:[{claimId:'claim_1'}]}]});
 expect(resolved.semanticChecks[0].readerSpans).toEqual([{claimId:'a',text:claim.text}]);
 const preserved=wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attributionPreserved:false,certaintyPreserved:true,temporalFaithful:true,qualifiersPreserved:false,reason:'Even a positive-sounding reason must not override negative flags.',readerSpans:[{claimId:'claim_1'}]}]});
 expect(preserved.preservedFactIds).toEqual([]);expect(preserved.semanticChecks[0]).toMatchObject({attribution:false,qualifiers:false});
 const repeated=wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attributionPreserved:true,certaintyPreserved:true,temporalFaithful:true,qualifiersPreserved:true,nonRepetitive:false,reason:'Same information repeated around a correction acknowledgment.',readerSpans:[{claimId:'claim_1'}]}]});
 expect(repeated.preservedFactIds).toEqual([]);
 expect(repeated.semanticChecks[0].nonRepetitive).toBe(false);
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
it('accepts witnesses from a second supported claim in the same story whose fact inventory is shared once',()=>{
 const first={id:'a',candidateId:'same-story',text:'The minister stepped down.',support:[{evidenceRevisionId:'r',quote:'The minister resigned.'}],context:[],requiredFacts:[{id:'f1',text:'The minister resigned.',evidenceRevisionIds:['r']},{id:'f2',text:'The vote is Monday.',evidenceRevisionIds:['r']}]};
 const wire=verificationWire([first,{...first,id:'b',text:'Voting is planned for Monday.',requiredFacts:undefined}]);
 const checks=[{factId:'fact_1',readerSpans:[{claimId:'claim_1',text:first.text}]},{factId:'fact_2',readerSpans:[{claimId:'claim_2',text:'Voting is planned for Monday.'}]}].map(c=>({...c,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Faithful meaning in actual supported reader prose.'}));
 expect(wire.decode({supportedClaimIds:['claim_1','claim_2'],preservedFactIds:['fact_1','fact_2'],semanticChecks:checks}).preservedFactIds).toEqual(['f1','f2']);
});
it('compacts provenance handles without losing separate supporting revisions',()=>{
 const ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'];
 const claim={id:'a',candidateId:'story',text:'Officials confirmed the result.',support:ids.map(evidenceRevisionId=>({evidenceRevisionId,quote:'Officials confirmed the result.'})),context:[],requiredFacts:[{id:'f',text:'Officials confirmed the result.',evidenceRevisionIds:ids}]};
 const wire=verificationWire([claim]);
 expect(wire.payload.stories[0].claims[0].support[0].evidenceRevisionIds).toEqual(['evidence_1','evidence_2']);
 expect(wire.payload.stories[0].facts[0].evidenceRevisionIds).toEqual(['evidence_1','evidence_2']);
 expect(claim.support.map(s=>s.evidenceRevisionId)).toEqual(ids);
});
