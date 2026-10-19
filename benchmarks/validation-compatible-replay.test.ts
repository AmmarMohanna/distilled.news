import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import saved from './validation-compatible-provider-verdicts.json';
import prior from './validation-contract-real-model-results.json';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {scoreValidationEvaluation} from '../scripts/validate-validation-labels.mjs';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
it('replays actual revised-contract verdicts without promoting AI labels to independent human gold',async()=>{
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NOT_A_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:saved.model} as any,()=>{throw Error('REPLAY_NETWORK_FORBIDDEN');})!;
 expect(model.promptVersion).toBe(saved.promptVersion);expect(model.validationContract).toBe(saved.validationContract);
 const labels=saved.judge.result.cases.map(c=>({id:saved.judgeCaseMap.find(m=>m.id===c.id)!.caseId,outcome:c.label})),verdicts=[];
 for(const row of saved.cases){
  const claims=prior.cases.find(c=>c.caseId===row.caseId)!.question;
  expect(hash(claims)).toBe(row.questionHash);expect(hash(model.verificationPayload!(claims))).toBe(row.wireHash);expect(await model.verificationRequestHash!(claims,row.maxOutputTokens)).toBe(row.requestHash);
  expect(row.settled).toBe(true);expect(row.receipts.some(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd===row.usage.cost)).toBe(true);
  const decision=decidePublicationPackets(claims,[{claims,result:row.result}]).decision;expect(decision).toEqual(row.decision);verdicts.push({id:row.caseId,compatible:true,decision:decision.status});
 }
 const score=scoreValidationEvaluation(labels,verdicts,'AI_ASSISTED');
 expect(score.independentGold).toBe(false);expect(score.compatibleVerdicts).toBe(12);expect(score.positiveAccepts).toBe(1);expect(score.falseAcceptances).toBe(0);expect(score.falseRejections).toBe(0);expect(score.unresolvedPositives).toBe(5);expect(score.unresolvedNegatives).toBe(5);
 // Genuine required coverage is not satisfied by the source-only bridge fact.
 const missing=saved.cases.find(c=>c.caseId==='T08')!;expect(missing.decision.status).not.toBe('ACCEPT');expect(missing.result.semanticChecks.find(c=>c.factId==='T08:fact:1')!.communicated).toBe(false);
});
