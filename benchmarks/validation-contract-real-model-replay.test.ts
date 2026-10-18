import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import report from './validation-contract-real-model-results.json';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {scoreValidationEvaluation} from '../scripts/validate-validation-labels.mjs';

it('replays exactly pinned real-provider control verdicts offline without promoting unresolved outcomes',async()=>{
 const data:any=report;
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,()=>{throw Error('SAVED_VERDICT_REPLAY_INFERENCE_FORBIDDEN');})!;
 const verdicts=[];
 for(const item of data.cases){
  expect(item.question).toBeDefined();expect(item.providerVerdict).toBeDefined();
  expect(createHash('sha256').update(JSON.stringify(item.question)).digest('hex')).toBe(item.questionHash);
  const admission=model.admission!(model.verificationPayload!(item.question));
  expect(await model.verificationRequestHash!(item.question,admission.maxOutputTokens)).toBe(item.requestHash);
  const decision=decidePublicationPackets(item.question,[{claims:item.question,result:item.providerVerdict}]).decision;
  expect(decision.status).toBe(item.decision);expect(decision.reasons).toEqual(item.reasons);
  expect(item.financialSettlementVerified).toBe(true);
  verdicts.push({id:item.caseId,compatible:true,decision:decision.status});
 }
 const score=scoreValidationEvaluation(data.cases.map((c:any)=>({id:c.caseId,outcome:c.expected})),verdicts,'AI_ASSISTED');
 expect(score.independentGold).toBe(false);expect(score.compatibleVerdicts).toBe(12);
 expect(score.falseAcceptances).toBe(0);expect(score.falseRejections).toBe(0);
 expect(score.positiveAccepts).toBe(5);expect(score.unresolvedPositives).toBe(1);expect(score.unresolvedNegatives).toBe(6);
 expect(data.cases.filter((c:any)=>c.expected==='NEGATIVE'&&c.decision==='REJECT')).toHaveLength(0);
});
