import {expect,it} from 'vitest';
import fixture from './fixtures/staging-temporal-framing.json';
import {factTiming} from './freshness';
import {checkReaderFidelity} from './fidelity';
import {writerWire,verificationWire} from './writer-wire';
import {createStoredEvidenceModel} from './model';
import type {Env} from '../types';
import type {SynthesisWriterInput,VerificationClaim} from './publication';
const timing=factTiming([{publishedAt:fixture.sourcePublishedAt,acceptedAt:fixture.window.end}],fixture.window);
const fact={...fixture.fact,timing};
const input={feed:{id:'f',revision:1,title:'Proof',interests:[],outputLanguage:'en'},selectionId:'s',window:{...fixture.window,kind:'30M'},stories:[{candidate:{id:'c',targetType:'EVENT',targetVersionId:'e'},approvedFacts:[{...fact,support:[{evidenceRevisionId:fact.evidenceRevisionIds[0],quote:fact.text}]}],evidence:[]}]} as SynthesisWriterInput;
it('the exact stale staging fact carries reporting age, not an invented event date, through both model requests',()=>{
 expect(timing).toMatchObject({sourcePublishedAt:fixture.sourcePublishedAt,framingRequired:true});expect(timing.eventTime).toBeUndefined();
 expect(writerWire(input).payload.window).toEqual(input.window);
 expect(writerWire(input).payload.stories[0].approvedFacts![0].timing).toEqual(timing);
 const claims:VerificationClaim[]=[{id:'c',candidateId:'story',text:fixture.badClaim,support:[],context:[],allowedFacts:[fact],requiredFacts:[fact]}];
 expect(verificationWire(claims).payload.stories[0].facts[0].timing).toEqual(timing);
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic'} as Env)!;
 expect(JSON.stringify(model.verificationPayload!(claims))).toContain('temporal is false');
 expect(JSON.stringify(model.synthesisPayload!(input))).toContain('sourcePublishedAt dates the report, not the event');
});
it('stale extractive prose cannot bypass temporal verification, including first editions',()=>{
 expect(checkReaderFidelity([fixture.badClaim],[fact],[fact],true).failures).toContainEqual({code:'TEMPORAL_FRAMING_REQUIRED',factId:fact.id});
});
it('a legitimate old report can be dated naturally without making its date a numeric invention',()=>{
 const text='An October 2 report shows a police officer finding a gun in Mangione?s backpack, days after the killing of UnitedHealthcare CEO Brian Thompson.';
 const check={factId:fact.id,communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'Report date, not event date.',readerSpans:[{claimId:'c',text}]};
 expect(checkReaderFidelity([text],[fact],[fact],true,{checks:[check]}).passed).toBe(true);
 const {decode}=verificationWire([{id:'c',candidateId:'story',text,support:[],context:[],requiredFacts:[fact]}]);
 expect(decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{...check,factId:'fact_1',readerSpans:[{claimId:'claim_1',text}]}]}).preservedFactIds).toEqual([fact.id]);
});
it('a semantic temporal failure is negative coverage even if other dimensions pass',()=>{
 const wire=verificationWire([{id:'c',candidateId:'story',text:fixture.badClaim,support:[],context:[],requiredFacts:[fact]}]);
 expect(wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:false,qualifiers:true,reason:'Old report sounds fresh.',readerSpans:[{claimId:'claim_1',text:fixture.badClaim}]}]}).preservedFactIds).toEqual([]);
});
it('current sources need no date clutter and unknown dates remain unknown',()=>{
 const current=factTiming([{publishedAt:fixture.window.start,acceptedAt:fixture.window.end}],fixture.window);
 expect(current.framingRequired).toBe(false);
 expect(checkReaderFidelity([fixture.fact.text],[{...fact,timing:current}],[{...fact,timing:current}],true).passed).toBe(true);
 const unknown=factTiming([{acceptedAt:fixture.window.end}],fixture.window);
 expect(unknown.sourcePublishedAt).toBeUndefined();expect(unknown.eventTime).toBeUndefined();expect(unknown.framingRequired).toBe(false);
});
it('source date never replaces a known distinct event time and does not authorize other dates or quantities',()=>{
 const distinct=factTiming([{publishedAt:fixture.sourcePublishedAt,acceptedAt:fixture.window.end}],fixture.window,{eventTime:'2026-09-30T10:00:00Z'});
 expect(distinct.sourcePublishedAt).toBe(fixture.sourcePublishedAt);expect(distinct.eventTime).toBe('2026-09-30T10:00:00Z');
 for(const text of ['An October 3 report shows the footage.','An October 2, 2025 report shows the footage.','Police found 2 guns.'])expect(checkReaderFidelity([text],[],[fact],true,{pending:true}).passed).toBe(false);
});
