import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import prior from './validation-contract-real-model-results.json';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {partitionVerification} from '../apps/worker/src/v1-intelligence/verification-packets';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
it('freezes one bounded batch without inference, preserving exact source/reader ownership',async()=>{
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,()=>{throw Error('PREFLIGHT_NETWORK_FORBIDDEN');})!;
 const claims=prior.cases.flatMap(c=>c.question),wire=model.verificationPayload!(claims),admission=model.admission!(wire),packets=partitionVerification(claims,c=>model.admission!(model.verificationPayload!(c)).fits);
 expect(packets).toHaveLength(1);expect(admission.fits).toBe(true);expect(admission.reservationCostUsd).toBeLessThan(.1);
 const manifest={scope:'One mixed twelve-control semantic evaluation, NOT an edition or full briefing cost. Existing AI labels; no new independent holdout.',promptVersion:model.promptVersion,contract:model.validationContract,provider:model.provider,model:model.model,maxCalls:1,maxRetries:0,maxRepairs:0,admission,claims,questionHash:hash(claims),wireHash:hash(wire),requestHash:await model.verificationRequestHash!(claims,admission.maxOutputTokens),expected:prior.cases.map(c=>({id:c.caseId,label:c.expected})),rawResponseRetentionRequired:true};
 mkdirSync('.local-reports/publication-day',{recursive:true});const path='.local-reports/publication-day/batch-manifest-v5.json';if(existsSync(path))expect(JSON.parse(readFileSync(path,'utf8'))).toEqual(manifest);else writeFileSync(path,JSON.stringify(manifest,null,2),{flag:'wx'});
 console.log(JSON.stringify({maxCalls:1,maxRepairs:0,maxRetries:0,requestBytes:admission.requestBytes,reservationCeilingUsd:admission.reservationCostUsd,promptVersion:model.promptVersion,requestHash:manifest.requestHash,model:model.model,provider:model.provider,networkCalls:0}));
});
