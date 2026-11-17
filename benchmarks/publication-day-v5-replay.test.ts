import {it,expect} from 'vitest';
import saved from './publication-day-v5-provider-evaluation.json';
import {verificationWire} from '../apps/worker/src/v1-intelligence/writer-wire';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {createHash} from 'node:crypto';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
it('replays the exact settled V5 raw response and compatible request without inference or invented verdicts',async()=>{
 const m=saved.manifest,claims=m.claims,model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:m.contract,DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:m.model} as any,()=>{throw Error('NETWORK_FORBIDDEN');})!;
 expect(model.promptVersion).toBe(m.promptVersion);expect(hash(claims)).toBe(m.questionHash);expect(hash(model.verificationPayload!(claims))).toBe(m.wireHash);expect(await model.verificationRequestHash!(claims,m.admission.maxOutputTokens)).toBe(m.requestHash);
 const decoded=verificationWire(claims,{validationContract:'EVIDENCE_GROUNDED_V2',requireReaderNovelty:true,requireFullEntailment:true}).decode(saved.rawVerdict);
 const {usage,...original}=saved.result.result;expect(decoded).toEqual(original);expect(saved.result.settled).toBe(true);expect(saved.result.calls).toBe(1);expect(saved.result.receipts.some(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd===usage.cost)).toBe(true);
 const outcomes=[];
 for(const expected of saved.result.cases){const owned=claims.filter(c=>c.id.startsWith(expected.id+':')),ids=new Set(owned.map(c=>c.id)),facts=new Set(owned.flatMap(c=>c.allowedFacts.map(f=>f.id)));const result={...decoded,supportedClaimIds:decoded.supportedClaimIds.filter(id=>ids.has(id)),preservedFactIds:decoded.preservedFactIds.filter(id=>facts.has(id)),novelFactIds:decoded.novelFactIds.filter(id=>facts.has(id)),semanticChecks:decoded.semanticChecks.filter(c=>owned.some(claim=>claim.candidateId===c.candidateId)),claimEntailment:decoded.claimEntailment.filter(c=>ids.has(c.claimId))};const decision=decidePublicationPackets(owned,[{claims:owned,result:result as any}]).decision;expect(decision).toEqual(expected.decision);outcomes.push({...expected,decision});}
 expect(outcomes.filter(c=>c.label==='POSITIVE'&&c.decision.status==='ACCEPT')).toHaveLength(6);expect(outcomes.filter(c=>c.label==='NEGATIVE'&&c.decision.status==='REJECT')).toHaveLength(4);expect(outcomes.filter(c=>c.decision.status==='UNRESOLVED')).toHaveLength(2);expect(outcomes.some(c=>c.label==='NEGATIVE'&&c.decision.status==='ACCEPT')).toBe(false);
});
