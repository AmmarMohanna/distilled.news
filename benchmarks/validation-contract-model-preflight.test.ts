import {it, expect} from 'vitest';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import controlled from './validation-audit-cases.json';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import type {VerificationClaim} from '../apps/worker/src/v1-intelligence/publication';

// Predeclared before receiving any provider response. These labels are the
// user-approved AI-assisted controls, not independent human gold or editions.
const selected = ['T01','T02','T05','T10','T18','T21','T03','T04','T06','T08','T16','T24'];
const root = '.local-reports/briefing-latency/';
const labelsFile = root+'validation-labels-recovered-2026-10-18/PUBLICATION_VALIDATION_LABELS_R3_AI_ASSISTED.json';
const load = (file:string) => JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

it.skipIf(!existsSync(labelsFile))('freezes a balanced real-verifier sample and exact admission ceilings without buying inference', async()=>{
 const labels=load(labelsFile), key=load(root+'validation-review-key-private.json');
 expect(labels.provenance).toBe('AI_ASSISTED');
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NOT_A_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,()=>{throw Error('PREFLIGHT_INFERENCE_FORBIDDEN');})!;
 const packets=[];
 for(const id of selected){
  const label=labels.cases.find((c:any)=>c.id===id), control=controlled.cases.find(c=>c.id===key[id].controlId)!;
  expect(control).toBeDefined();
  const negative=label.claims.some((c:any)=>c.support==='ERROR')||label.requirements.some((r:any)=>r.materiality==='REQUIRED'&&r.communication==='OMITTED');
  expect(label.claims.some((c:any)=>c.support==='UNRESOLVED')).toBe(false);
  const facts=control.facts.map((text,i)=>({id:`${id}:fact:${i}`,text,evidenceRevisionIds:[`${id}:source:1`],...('reportDate' in control?{timing:{sourcePublishedAt:control.reportDate,framingRequired:false}}:{})}));
  const claims:VerificationClaim[]=[{id:`${id}:claim:1`,candidateId:`${id}:story`,text:control.draft,support:facts.map(f=>({evidenceRevisionId:f.evidenceRevisionIds[0],quote:f.text})),context:[{evidenceRevisionId:`${id}:source:1`,text:control.facts.join('\n'),truncated:false}],allowedFacts:facts,requiredFacts:facts,newUnderstandingFacts:facts,previousLedgerFacts:[],previousReaderClaims:[],correctionObligations:[]}];
  const wire=model.verificationPayload!(claims), admission=model.admission!(wire);
  expect(admission.fits).toBe(true);
  packets.push({caseId:id,expected:negative?'NEGATIVE':'POSITIVE',claims,wire,questionHash:hash(claims),wireHash:hash(wire),requestHash:await model.verificationRequestHash!(claims,admission.maxOutputTokens),admission});
 }
 expect(packets.filter(p=>p.expected==='POSITIVE')).toHaveLength(6);
 expect(packets.filter(p=>p.expected==='NEGATIVE')).toHaveLength(6);
 const requestSetHash=hash(packets.map(p=>({caseId:p.caseId,requestHash:p.requestHash,expected:p.expected})));
 const authorityFile=root+'validation-eval-authority-readonly.json';
 const grant=existsSync(authorityFile)?load(authorityFile).result?.[0]?.results?.[0]:undefined;
 const headroom=grant?Number(grant.amended_cap_usd??grant.base_cap_usd)-Number(grant.reported_cost_usd??0)-Number(grant.held_cost_usd??0):null;
 const summary={applicationCommit:'c389419',provenance:'AI_ASSISTED',independentHumanGold:0,selection:'Predeclared balanced facet sample; exposed to prior audit, not a blinded holdout.',model:model.model,provider:model.provider,contract:model.validationContract,promptVersion:model.promptVersion,semanticPolicy:'semantic-publication-v2',maxNewCalls:12,maxRepairs:0,maxRetries:0,requestSetHash,cases:packets.map(p=>({caseId:p.caseId,expected:p.expected,requestHash:p.requestHash,requestBytes:p.admission.requestBytes,reservationCeilingUsd:p.admission.reservationCostUsd})),totalReservationCeilingUsd:packets.reduce((n,p)=>n+p.admission.reservationCostUsd,0),minimumSingleReservationUsd:Math.min(...packets.map(p=>p.admission.reservationCostUsd)),observedHeadroomUsd:headroom,admissionAtSnapshot:headroom===null?'UNVERIFIED':packets.every(p=>p.admission.reservationCostUsd>headroom)?'BLOCKED_EXISTING_AUTHORITY':'REQUIRES_ATOMIC_LEDGER_ADMISSION',providerCalls:0,actualProviderCostUsd:null,actualProviderLatencyMs:null,falseAcceptances:null,falseRejections:null,unresolvedRate:null};
 writeFileSync(root+'validation-contract-model-evaluation-packets.json',JSON.stringify({summary,packets},null,2));
 writeFileSync(root+'validation-contract-model-evaluation-preflight.json',JSON.stringify(summary,null,2));
 console.log(JSON.stringify(summary));
});
