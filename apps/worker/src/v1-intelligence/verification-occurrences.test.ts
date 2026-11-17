import {it,expect} from 'vitest';
import {verificationWire} from './writer-wire';
import {mergeVerification} from './verification-packets';
const fact={id:'shared-fact',text:'The company disputes the reason for the dismissal.',evidenceRevisionIds:['revision']};
const claims:any[]=[
 {id:'a-claim',candidateId:'a',text:fact.text,support:[{evidenceRevisionId:'revision',quote:fact.text}],context:[],allowedFacts:[fact],requiredFacts:[fact],newUnderstandingFacts:[],previousLedgerFacts:[fact.text]},
 {id:'b-claim',candidateId:'b',text:fact.text,support:[{evidenceRevisionId:'revision',quote:fact.text}],context:[],allowedFacts:[fact],requiredFacts:[fact],newUnderstandingFacts:[fact],previousLedgerFacts:[]}
];
const verdict=(id:string,claimId:string,status:string,history:string[])=>({factId:id,communicated:true,nonRepetitive:true,attribution:true,certainty:true,temporal:true,qualifiers:true,reason:'The actual prose preserves the supported proposition.',readerSpans:[{claimId}],readerNovelty:{status,reason:'Judged against this occurrence history.',previousFactTexts:history}});
function response(wire:ReturnType<typeof verificationWire>){const [a,b]=wire.payload.stories;return {supportedClaimIds:['claim_1','claim_2'],preservedFactIds:[a.requiredFactIds[0],b.requiredFactIds[0]],addressedCorrectionObligationIds:[],semanticChecks:[verdict(a.requiredFactIds[0],'claim_1','ALREADY_COMMUNICATED',[fact.text]),verdict(b.requiredFactIds[0],'claim_2','NEW',[])],claimEntailment:[{claimId:'claim_1',fullyEntailed:true,reason:'Supported.',unsupportedMeaning:[]},{claimId:'claim_2',fullyEntailed:true,reason:'Supported.',unsupportedMeaning:[]}]}}
it('the same fact has independent occurrence aliases, reader histories and exact prose witnesses',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true,requireFullEntailment:true});
 expect(wire.payload.stories[0].requiredFactIds[0]).not.toBe(wire.payload.stories[1].requiredFactIds[0]);
 const decoded=wire.decode(response(wire));expect(decoded.semanticChecks.map(c=>[c.candidateId,c.factId,c.readerNovelty?.status])).toEqual([['a','shared-fact','ALREADY_COMMUNICATED'],['b','shared-fact','NEW']]);
 expect(decoded.semanticChecks[1].readerSpans![0].claimId).toBe('b-claim');
});
it('a shared fact identity cannot launder a different-story reader witness',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true,requireFullEntailment:true}),raw=response(wire);raw.semanticChecks[1].readerSpans=[{claimId:'claim_1'}];
 const decoded=wire.decode(raw);expect(decoded.semanticChecks[1]).toMatchObject({candidateId:'b',communicated:false,readerSpans:[]});
});
it('packet reconciliation keeps independent same-fact occurrence verdicts instead of losing one',()=>{
 const wire=verificationWire(claims,{requireReaderNovelty:true,requireFullEntailment:true}),decoded=wire.decode(response(wire));
 const result=mergeVerification([{claims,result:{...decoded,usage:{tokensIn:1,tokensOut:1,cost:0,confirmed:true}}}],true);
 expect(result.semanticChecks).toHaveLength(2);expect(result.semanticChecks!.map(c=>c.candidateId)).toEqual(['a','b']);
});
