import {it,expect} from 'vitest';
import saved from './publication-day-v4-provider-evaluation.json';
import {verificationWire} from '../apps/worker/src/v1-intelligence/writer-wire';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
it('replays actual raw V4 anchoring failures offline without upgrading its paid receipt to V5',async()=>{
 const claims=saved.manifest.claims,wire=verificationWire(claims,{validationContract:'EVIDENCE_GROUNDED_V2',requireFullEntailment:true,requireReaderNovelty:true}),decoded=wire.decode(saved.rawVerdict);
 const original=saved.originalResult.cases.find(c=>c.id==='T01')!;expect(original.decision.status).toBe('UNRESOLVED');
 const now=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:saved.manifest.model} as any,()=>{throw Error('REPLAY_INFERENCE_FORBIDDEN');})!;
 expect(await now.verificationRequestHash!(claims,saved.manifest.admission.maxOutputTokens)).not.toBe(saved.manifest.requestHash);
 const decisions=saved.manifest.expected.map(label=>{const owned=claims.filter(c=>c.id.startsWith(label.id+':')),ids=new Set(owned.map(c=>c.id)),facts=new Set(owned.flatMap(c=>c.allowedFacts.map(f=>f.id)));const result={...decoded,supportedClaimIds:decoded.supportedClaimIds.filter(id=>ids.has(id)),preservedFactIds:decoded.preservedFactIds.filter(id=>facts.has(id)),novelFactIds:decoded.novelFactIds.filter(id=>facts.has(id)),semanticChecks:decoded.semanticChecks.filter(c=>owned.some(claim=>claim.candidateId===c.candidateId)),claimEntailment:decoded.claimEntailment.filter(c=>ids.has(c.claimId))};return {...label,decision:decidePublicationPackets(owned,[{claims:owned,result:result as any}]).decision};});
 expect(decisions.filter(c=>c.label==='POSITIVE').every(c=>c.decision.status==='ACCEPT')).toBe(true);
 expect(decisions.filter(c=>c.label==='NEGATIVE').every(c=>c.decision.status!=='ACCEPT')).toBe(true);
 expect(decisions.find(c=>c.id==='T24')!.decision.status).toBe('REJECT');
 // Actual hallucinated source-only bridge excerpt remains absent and blocked.
 expect(saved.rawVerdict.semanticChecks.find(c=>c.factId==='fact_12')!.readerSpans[0].text).toBe('The bridge remains closed.');
 expect(decoded.semanticChecks.find(c=>c.factId==='T08:fact:1')!.readerSpans).toEqual([]);
 expect(decisions.find(c=>c.id==='T08')!.decision.status).toBe('UNRESOLVED');
});
