import {it,expect} from 'vitest';
import fixture from './fixtures/staging-causal-bridge.json';
import {verificationWire} from './writer-wire';
import {createStoredEvidenceModel} from './model';
import type {Env} from '../types';
it('the actual staging causal bridge is rejected by a negative qualifier verdict rather than fact IDs',()=>{
 const fact={id:'f',text:fixture.supports[0],evidenceRevisionIds:['r'],context:{evidenceRevisionId:'r',field:'title' as const,text:fixture.supports[1]}};
 const claims=[{id:'c',candidateId:'story',text:fixture.claim,support:[],context:[],requiredFacts:[fact],allowedFacts:[fact]}];
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'synthetic'} as Env)!;
 expect(JSON.stringify(model.verificationPayload!(claims))).toContain('sequence, not causation');
 const wire=verificationWire(claims),result=wire.decode({supportedClaimIds:['claim_1'],preservedFactIds:['fact_1'],semanticChecks:[{factId:'fact_1',communicated:true,attribution:true,certainty:true,temporal:true,qualifiers:false,reason:'Potential law breach does not establish what prompted the announcement.',readerSpans:[{claimId:'claim_1',text:fixture.claim}]}]});
 expect(result.preservedFactIds).toEqual([]);
});
