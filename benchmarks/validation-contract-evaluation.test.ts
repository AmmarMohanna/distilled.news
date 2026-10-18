import {expect,it,vi} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateLabels,scoreValidationEvaluation} from '../scripts/validate-validation-labels.mjs';
import controlled from './validation-audit-cases.json';
import {assessWriterDraft} from '../apps/worker/src/v1-intelligence/publication-prechecks';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {partitionVerification} from '../apps/worker/src/v1-intelligence/verification-packets';
import {verificationCostEnvelope} from '../apps/worker/src/v1-intelligence/verification-cost';
import type {VerificationClaim} from '../apps/worker/src/v1-intelligence/publication';
const root='.local-reports/briefing-latency/',labelsFile=root+'validation-labels-recovered-2026-10-18/PUBLICATION_VALIDATION_LABELS_R3_AI_ASSISTED.json';
const load=(file:string)=>JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
it.skipIf(!existsSync(labelsFile))('replays reviewed labels and saved drafting routes with network forbidden and no invented semantic verdicts',()=>{
 vi.stubGlobal('fetch',()=>{throw Error('OFFLINE_EVALUATION_NETWORK_FORBIDDEN');});
 try{
  const labels=load(labelsFile),key=load(root+'validation-review-key-private.json');
  const artifacts=Object.fromEntries(['REVIEW.md','sources.md','drafts.md','SPECIFICATION.md','IMPLEMENTATION_PLAN.md','LABEL_CONTRACT.md'].map(n=>[n,readFileSync(root+'validation-contract-review-r2/'+n)]));
  for(const n of ['SPECIFICATION','IMPLEMENTATION_PLAN','LABEL_CONTRACT'])artifacts[n+'(1).md']=readFileSync(root+'validation-contract-review-r3-final/'+n+'.md');
  const reviewed=validateLabels(labels,{caseIds:[...Array.from({length:25},(_,i)=>`S${String(i+1).padStart(2,'0')}`),...Array.from({length:24},(_,i)=>`T${String(i+1).padStart(2,'0')}`)],artifacts,sourceManifestSha256:createHash('sha256').update(readFileSync(root+'validation-contract-review-r2/ORIGINAL_PACKET_MANIFEST.json')).digest('hex')});
  expect(reviewed.valid).toBe(true);expect(reviewed.exactWitnessOccurrences).toBe(243);expect(reviewed.scopeHashOccurrences).toBe(113);
  const controls=reviewed.cases.filter((c:any)=>c.id.startsWith('T')).map((label:any)=>{
   const c=controlled.cases.find(c=>c.id===key[label.id].controlId)!;expect(c).toBeDefined();
   const facts=c.facts.map((text,index)=>({id:'f'+index,text,evidenceRevisionIds:['r'],...('reportDate'in c?{timing:{sourcePublishedAt:c.reportDate,framingRequired:false}}:{})}));
   const required='required'in c?facts.filter((_,i)=>c.required!.includes(i)):facts;
   const input:any={feed:{outputLanguage:'en'},stories:[{candidate:{id:'candidate'},plan:{facts,mustIncludeFactIds:required.map(f=>f.id),attributionFactIds:[],certaintyFactIds:[],disagreementFactIds:[],openQuestionFactIds:[]},evidence:[{id:'r',language:'en'}]}]};
   const draft:any={language:'en',stories:[{candidateId:'candidate',claims:[{text:c.draft,support:facts.map(f=>({evidenceRevisionId:'r',quote:f.text}))}]}]};
   const assessment=assessWriterDraft(input,draft,()=>facts.map(f=>({evidenceRevisionId:'r',quote:f.text})),'EVIDENCE_GROUNDED_V2',true);
   return {id:label.id,label:label.outcome,route:assessment.decision,hardIssues:assessment.blockingIssues.map(i=>i.code),warnings:assessment.factualWarnings.map(i=>i.code)};
  });
  const score=scoreValidationEvaluation(reviewed.cases,[],'AI_ASSISTED');
  expect(score.missingVerdicts).toBe(49);expect(score.falseAcceptances).toBeNull();expect(score.falseRejections).toBeNull();
  const artifact=load(root+'validation-artifacts.json'),docs=artifact.result.flatMap((r:any)=>r.results).map((r:any)=>({kind:r.kind,value:JSON.parse(r.json)}));
  const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NON_CREDENTIAL',DISTILLED_LIVE_OPENROUTER_MODEL:'openai/gpt-4.1-mini'} as any,()=>{throw Error('INFERENCE_FORBIDDEN');})!;
  const attempts:any[]=[];
  for(const {value:work} of docs.filter((d:any)=>d.kind==='publication_work')){
   const stories=work.packets.flatMap((p:any)=>p.stories);
   const input:any={...work.packets[0],editorialPlan:{id:'saved',route:'GPT'},stories:stories.map((s:any)=>({...s,eventVersions:[],plan:{...s.plan,facts:s.approvedFacts.map((f:any)=>({...f,evidenceRevisionIds:[...new Set(f.support.map((r:any)=>r.evidenceRevisionId))]}))}}))};
   for(const {value:draft} of docs.filter((d:any)=>d.kind==='drafts'&&(d.value.id===work.selectionId||d.value.id===JSON.stringify([work.selectionId,'repair-1'])))){
    const route=assessWriterDraft(input,draft.draft,(s:any)=>stories.find((w:any)=>w.candidate.id===s.candidate.id).approvedSpans,'EVIDENCE_GROUNDED_V2',true);
    const claims:VerificationClaim[]=draft.draft.stories.flatMap((s:any)=>s.claims.map((c:any,i:number)=>{const approved=stories.find((w:any)=>w.candidate.id===s.candidateId);const facts=approved.approvedFacts.map((f:any)=>({id:f.id,text:f.text,evidenceRevisionIds:[...new Set(f.support.map((r:any)=>r.evidenceRevisionId))],timing:f.timing,attribution:f.attribution}));return {...c,id:`${s.candidateId}:${i}`,candidateId:s.candidateId,allowedFacts:facts,requiredFacts:i===0?facts.filter((f:any)=>approved.plan.mustIncludeFactIds.includes(f.id)):[],context:approved.approvedSpans.map((p:any)=>({evidenceRevisionId:p.evidenceRevisionId,text:p.quote,truncated:false}))};}));
    const packets=partitionVerification(claims,c=>model.admission!(model.verificationPayload!(c)).fits),admissions=packets.map(c=>model.admission!(model.verificationPayload!(c)));
    const cost=verificationCostEnvelope(admissions,{plannedPackets:packets.length,cachedPackets:0,newAuthorizedCalls:0,unavailablePackets:packets.length});
    attempts.push({draftId:draft.id,route:route.decision,hardIssues:route.blockingIssues.map(i=>({code:i.code,candidateId:i.candidateId,value:i.value})),warningCount:route.factualWarnings.length,storyCount:input.stories.length,claimCount:claims.length,packetInputScope:'DIAGNOSTIC_V2_TRANSPORT_OF_FROZEN_LEGACY_EDITORIAL_REQUIREMENTS_NOT_A_NEW_V2_PLAN',cost,semanticDecision:'UNRESOLVED_NO_COMPATIBLE_VERDICT'});
   }
  }
  const legacyVerdicts=docs.filter((d:any)=>d.kind==='verification_results');
  const report={provenance:'AI_ASSISTED',independentHumanGold:0,caseSpecificLabels:reviewed.cases.map(({id,outcome,drafts}:any)=>({id,outcome,drafts})),controls,controlRouting:{positives:controls.filter((r:any)=>r.label==='POSITIVE').length,negatives:controls.filter((r:any)=>r.label==='NEGATIVE').length,unresolvedLabels:controls.filter((r:any)=>r.label==='UNRESOLVED').length,falseHardRejections:controls.filter((r:any)=>r.label==='POSITIVE'&&r.route==='HARD_REJECT').length,positiveUnresolvedPrechecks:controls.filter((r:any)=>r.label==='POSITIVE'&&r.route==='UNRESOLVED').length,automaticAcceptances:0},savedDraftDiagnostics:attempts,semanticEvaluation:score,legacyVerificationDocuments:legacyVerdicts.length,legacyCompatibleWithV2:0,legacyExclusionReason:'Missing exact v2 evidence/draft/prompt/packet/editorial policy and paid-verdict compatibility manifest. Historical verdicts are not upgraded.',newInferenceCalls:0,newProviderCostUsd:0,actualV2ProviderCost:'UNMEASURED',liveLockTime:'UNMEASURED'};
  expect(report.controlRouting.falseHardRejections).toBe(0);expect(report.controlRouting.automaticAcceptances).toBe(0);
  writeFileSync(root+'validation-contract-offline-evaluation.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({controlRouting:report.controlRouting,semanticEvaluation:score,savedDrafts:attempts.map(a=>({route:a.route,packetCount:a.cost.plannedPackets,bytes:a.cost.requestBytes,reservationCeilingUsd:a.cost.reservationCeilingUsd})),inferenceCalls:0}));
 }finally{vi.unstubAllGlobals();}
});
