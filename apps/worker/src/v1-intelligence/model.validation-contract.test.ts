import {expect,it} from 'vitest';
import {createStoredEvidenceModel,APPROVED_FACT_PROMPT_VERSION} from './model';
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
