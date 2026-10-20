import {expect,it} from 'vitest';
import {createStoredEvidenceModel,createEvaluationEvidenceModel,APPROVED_FACT_PROMPT_VERSION} from './model';
const env:any={V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL'};
const claims:any=[{id:'c',candidateId:'s',text:'Officials approved the plan.',support:[],context:[]}];
const forbidden=()=>{throw Error('NO_INFERENCE_ALLOWED');};
it('leaves legacy prompts and payload shape as the default',()=>{
 const model=createStoredEvidenceModel(env,forbidden)!;expect(model.validationContract).toBe('LEGACY');expect(model.promptVersion).toBe(APPROVED_FACT_PROMPT_VERSION);expect(model.verificationRequestHash).toBeUndefined();expect(Object.keys(model.verificationPayload!(claims) as object)).toEqual(['payload','schema']);
});
it('binds actual v2 transport prompt/schema bytes and output limit without provider access',async()=>{
 const model=createStoredEvidenceModel({...env,V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2'},forbidden)!;
 const first=await model.verificationRequestHash!(claims,32768);expect(first).toMatch(/^[a-f0-9]{64}$/);
 expect(await model.verificationRequestHash!(claims,32768)).toBe(first);
 expect(await model.verificationRequestHash!(claims,100)).not.toBe(first);
 expect(await model.verificationRequestHash!([{...claims[0],text:'Officials may approve the plan.'}],32768)).not.toBe(first);
});
it('keeps live qualification blocked while isolated evaluation reuses exact V2 requests and decoding',async()=>{
 const cf={...env,DISTILLED_LLM_API_GATEWAY:'cloudflare',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2'};
 const live=createStoredEvidenceModel(cf,forbidden)!;
 expect(live.admission!(live.verificationPayload!([]),'GROUNDING').reason).toBe('MODEL_UNQUALIFIED');
 let captured:any;
 const evaluation=createEvaluationEvidenceModel(cf,{admission:()=>({fits:true,requestBytes:1,inputTokenUpperBound:1,maxOutputTokens:4096,reservationCostUsd:.01}),complete:async request=>{captured=request;return {result:{supportedClaimIds:[],preservedFactIds:[],semanticChecks:[],claimEntailment:[],addressedCorrectionObligationIds:[]},usage:{tokensIn:1,tokensOut:1,cost:.001,confirmed:true}}}})!;
 expect(evaluation.verificationPayload!([])).toEqual(live.verificationPayload!([]));
 const result=await evaluation.verify!([],{maxOutputTokens:4096,signal:new AbortController().signal});
 expect(captured.route.identity).toBe('cloudflare:openai/gpt-4.1');expect(captured.phase).toBe('GROUNDING');expect(result.usage.confirmed).toBe(true);
 expect(live.admission!(live.verificationPayload!([]),'GROUNDING').reason).toBe('MODEL_UNQUALIFIED');
});
it('does not settle a later evaluation failure with the previous confirmed charge',async()=>{
 let calls=0;const model=createEvaluationEvidenceModel({...env,V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2'},{admission:()=>({fits:true,requestBytes:1,inputTokenUpperBound:1,maxOutputTokens:4096,reservationCostUsd:.02}),complete:async()=>{if(++calls>1)throw Error('UNKNOWN_CURRENT_OPERATION');return {result:{supportedClaimIds:[],preservedFactIds:[],semanticChecks:[],claimEntailment:[],addressedCorrectionObligationIds:[]},usage:{tokensIn:1,tokensOut:1,cost:.001,confirmed:true}}}})!;
 const limits={maxOutputTokens:4096,signal:new AbortController().signal};await model.verify!([],limits);expect(model.usage!().confirmed).toBe(true);
 await expect(model.verify!([],limits)).rejects.toThrow('UNKNOWN_CURRENT_OPERATION');expect(model.usage!()).toEqual({tokensIn:0,tokensOut:0,cost:.02,confirmed:false});
});
