import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {extractClaimMentions} from '../apps/worker/src/v1-intelligence/claims';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from '../apps/worker/src/v1-intelligence/construction-transport';
import {parseConstruction} from '../apps/worker/src/v1-intelligence/semantic-construction';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {verificationWire} from '../apps/worker/src/v1-intelligence/writer-wire';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
import {admitModelOperation,modelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';
import {structuredCompletionBody,cloudflareCompletionBody} from '../apps/worker/src/ai';
import {workersAiRequest} from '../apps/worker/src/workers-ai';
export const evidenceHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const STRONG_ROUTES=['cloudflare','openrouter','workers_ai'] as const;
export interface ComparisonRow {route:string;caseId:string;wallMs:number;settled:boolean;costUsd?:number;validation?:{valid:boolean};qualityReview:'PENDING'|'HUMAN_ACCEPTED';errorCode?:string}
export function compareStrongRoutes(rows:ComparisonRow[],caseIds:string[],routes:readonly string[]){
 const ranking=routes.map(route=>{const r=rows.filter(r=>r.route===route),reasons:string[]=[];
  if(r.length!==caseIds.length||new Set(r.map(r=>r.caseId)).size!==caseIds.length||caseIds.some(id=>!r.some(r=>r.caseId===id)))reasons.push('INCOMPLETE_MATCHED_CASES');
  if(!caseIds.length||r.some(r=>!Number.isFinite(r.wallMs)||r.wallMs<0))reasons.push('INVALID_MEASUREMENTS');
  if(r.some(r=>r.errorCode||!r.validation?.valid))reasons.push('QUALITY_OR_RELIABILITY_FAILURE');
  if(r.some(r=>!r.settled||typeof r.costUsd!=='number'||!Number.isFinite(r.costUsd)||r.costUsd<0))reasons.push('UNCONFIRMED_COST');
  if(r.some(r=>r.qualityReview!=='HUMAN_ACCEPTED'))reasons.push('QUALITY_REVIEW_PENDING');
  const times=r.map(r=>r.wallMs).sort((a,b)=>a-b),medianMs=times.length?times[Math.floor(times.length/2)]:null;
  return {route,eligible:reasons.length===0,reasons,completedCases:r.length,medianMs,totalConfirmedUsd:r.reduce((n,r)=>n+(r.settled?r.costUsd??0:0),0)};
 }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(a.medianMs??Infinity)-(b.medianMs??Infinity)||a.totalConfirmedUsd-b.totalConfirmedUsd);
 const complete=ranking.length>0&&ranking.every(r=>!r.reasons.some(reason=>['INCOMPLETE_MATCHED_CASES','UNCONFIRMED_COST','QUALITY_REVIEW_PENDING','INVALID_MEASUREMENTS'].includes(reason)));
 return {bestRoute:complete?ranking.find(r=>r.eligible)?.route??null:null,ranking,productionQualificationChanged:false};
}
export async function prepareStrongComparison(){
 const saved=JSON.parse(readFileSync('benchmarks/validation-contract-real-model-results.json','utf8'));
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE'} as any)!;
 const cases:{id:string;kind:'CONSTRUCTION'|'VERIFICATION';labelSource:string;payload:any;schema:object;validate:(raw:any)=>any}[]=[];
 const short=saved.cases.find((c:any)=>c.caseId==='T01');
 const multi='The Harbor bridge reopened on Monday. Engineers approved repairs to the Harbor bridge. The city confirmed that the Harbor bridge passed inspection. The Valley hospital opened a ward. Doctors confirmed that the Valley hospital added beds. The Valley hospital hired nurses.';
 for(const [id,body,context,revisionId] of [['SHORT_T01',short.question[0].context[0].text,short.question[0].context,short.question[0].context[0].evidenceRevisionId],['MULTI_DEVELOPMENT',multi,[{text:multi}],'controlled-multi-source']] as const){
  const revision:any={id:revisionId,feedId:'isolated-provider-evaluation',body,contentHash:evidenceHash(context),acceptedAt:'2026-10-03T12:00:00Z'},input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[]};const {mentions}=await extractClaimMentions(revision);
  const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION,source:{id:revision.id,text:revision.body},claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,span:m.span,certainty:m.certainty,attribution:m.attribution}))});
  cases.push({id,kind:'CONSTRUCTION',labelSource:id==='SHORT_T01'?'Existing frozen controlled T01':'Hand-authored bridge/hospital grouping oracle',payload:wire.state,schema:wire.schema,validate:raw=>{
   const result=parseConstruction(wire.decode(raw),mentions,input,{scorer:'REAL_COMPARISON',policyVersion:'strong-route-comparison-v1'});
   const expected=id==='SHORT_T01'?[mentions.map(m=>m.id)]:[mentions.filter(m=>m.sourceText.includes('Harbor bridge')).map(m=>m.id),mentions.filter(m=>m.sourceText.includes('Valley hospital')).map(m=>m.id)];
   const signature=(groups:string[][])=>groups.map(g=>[...g].sort().join('|')).sort();
   return {valid:JSON.stringify(signature(result.groups.map(g=>g.claimMentionIds)))===JSON.stringify(signature(expected))&&result.groups.every(g=>g.structuralRelation==='NEW_STORYLINE'),groupCount:result.groups.length,expectedGroupCount:expected.length,exactEvidenceCoverage:true};
  }});
 }
 for(const id of ['T01','T04','T06','T08']){
  const c=saved.cases.find((c:any)=>c.caseId===id),payload=model.verificationPayload!(c.question) as {payload:any;schema:object},wire=verificationWire(c.question,{requireReaderNovelty:true,requireFullEntailment:true,validationContract:'EVIDENCE_GROUNDED_V2'});
  cases.push({id:'VERIFY_'+id,kind:'VERIFICATION',labelSource:'Frozen controlled '+id+'; not independent human gold',...payload,validate:raw=>{const decoded=wire.decode(raw);/* Validation-only reducer shape; no billing confirmation or settlement. */const result={...decoded,usage:{tokensIn:0,tokensOut:0,cost:0,confirmed:false}},decision=decidePublicationPackets(c.question,[{claims:c.question,result}]).decision;return {valid:decision.status===(c.expected==='POSITIVE'?'ACCEPT':'REJECT'),decision,invalidAccept:c.expected==='NEGATIVE'&&decision.status==='ACCEPT'}}});
 }
 const packets=STRONG_ROUTES.flatMap(route=>cases.map(c=>{
  const model=route==='workers_ai'?'workers_ai:@cf/qwen/qwen3-30b-a3b-fp8':route==='cloudflare'?'cloudflare:openai/gpt-4.1':'openai/gpt-4.1';
  const admission=admitModelOperation(model,c.payload,c.schema,modelCapability(model),4096);
  const request=route==='workers_ai'?{model:model.replace('workers_ai:',''),input:workersAiRequest(JSON.stringify(c.payload),c.schema,4096)}:route==='cloudflare'?cloudflareCompletionBody(model,JSON.stringify(c.payload),c.schema,4096):structuredCompletionBody(model,JSON.stringify(c.payload),c.schema,4096);
  return {route,model,caseId:c.id,kind:c.kind,payload:c.payload,schema:c.schema,evidenceHash:evidenceHash(c.payload),requestHash:evidenceHash(request),admission};
 }));
 return {cases,packets};
}
