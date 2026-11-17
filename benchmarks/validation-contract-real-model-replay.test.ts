import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import report from './validation-contract-real-model-results.json';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {scoreValidationEvaluation} from '../scripts/validate-validation-labels.mjs';
// Historical algorithm only; never a runtime fallback or new receipt authority.
// @ts-expect-error trusted test-only Git baseline
import {decidePublicationPackets as historicalPackets} from 'virtual:historical-validation';

it('retains pinned historical real-provider outputs but excludes them from the new witness contract',async()=>{
 const data:any=report;
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,()=>{throw Error('SAVED_VERDICT_REPLAY_INFERENCE_FORBIDDEN');})!;
 const verdicts=[];
 for(const item of data.cases){
  expect(item.question).toBeDefined();expect(item.providerVerdict).toBeDefined();
  expect(createHash('sha256').update(JSON.stringify(item.question)).digest('hex')).toBe(item.questionHash);
  const admission=model.admission!(model.verificationPayload!(item.question));
  expect(await model.verificationRequestHash!(item.question,admission.maxOutputTokens)).not.toBe(item.requestHash);
  const historical=historicalPackets(item.question,[{claims:item.question,result:item.providerVerdict}]).decision;
  expect(historical.status).toBe(item.decision);expect(historical.reasons).toEqual(item.reasons);
  const decision=decidePublicationPackets(item.question,[{claims:item.question,result:item.providerVerdict}]).decision;
  expect(decision.status).toBe('UNRESOLVED');
  expect(item.financialSettlementVerified).toBe(true);
  verdicts.push({id:item.caseId,compatible:false,decision:decision.status});
 }
 const score=scoreValidationEvaluation(data.cases.map((c:any)=>({id:c.caseId,outcome:c.expected})),verdicts,'AI_ASSISTED');
 expect(score.independentGold).toBe(false);expect(score.compatibleVerdicts).toBe(0);
 expect(score.falseAcceptances).toBeNull();expect(score.falseRejections).toBeNull();
 expect(data.confusion.correctAcceptances).toBe(5);expect(data.confusion.unresolvedPositives).toBe(1);expect(data.confusion.unresolvedNegatives).toBe(6);
 expect(data.cases.filter((c:any)=>c.expected==='NEGATIVE'&&c.decision==='REJECT')).toHaveLength(0);
});
