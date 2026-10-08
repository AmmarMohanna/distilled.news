import {it,expect} from 'vitest';
import {verificationWire} from './writer-wire';
const source='OpenAI introduced an interactive visual interface.';
it.each([
 [source,true,[]],
 ['OpenAI launched an interactive visual interface.',true,[]],
 [source+' enhancing the user experience.',false,['An improvement to user experience is not entailed.']],
 [source+' making search significantly easier.',false,['An ease-of-use benefit is not entailed.']],
 [source+' because users demanded it.',false,['The cause and attributed user demand are not entailed.']],
 [source+' to defeat its competitors.',false,['The company intent is not entailed.']]
])('full-claim semantic entailment governs every generated component: %s',(text,entailed,meaning)=>{
 const wire=verificationWire([{id:'claim',candidateId:'story',text,support:[{evidenceRevisionId:'r',quote:source}],context:[],requiredFacts:[{id:'fact',text:source,evidenceRevisionIds:['r']}],newUnderstandingFacts:[{id:'fact',text:source,evidenceRevisionIds:['r']}],previousLedgerFacts:[]}],{requireReaderNovelty:true,requireFullEntailment:true});
 const raw={supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],addressedCorrectionObligationIds:[],claimEntailment:[{claimId:'claim_1',fullyEntailed:entailed,reason:entailed?'Equivalent supported meaning.':'Unsupported additional semantic component.',unsupportedMeaning:meaning}],semanticChecks:[{factId:'fact_1',communicated:true,attributionPreserved:true,certaintyPreserved:true,temporalFaithful:true,qualifiersPreserved:true,nonRepetitive:true,reason:'Core launch fact is expressed.',readerSpans:[{claimId:'claim_1'}],readerNovelty:{status:'NEW',reason:'No equivalent reader history.',previousFactTexts:[]}}]};
 const result=wire.decode(raw);expect(result.supportedClaimIds).toEqual(entailed?['claim']:[]);expect(result.preservedFactIds).toEqual(entailed?['fact']:[]);
 expect(wire.schema.required).toContain('claimEntailment');
 expect(wire.decode({...raw,claimEntailment:[]}).supportedClaimIds).toEqual([]);
});
