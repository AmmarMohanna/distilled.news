import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {generateBriefing,DEFAULT_ENGINE} from '../packages/briefing/src/engine';
import {VERIFY_SYSTEM_V7} from '../packages/briefing/src/prompts-v7';
import {archivedV7System as v7System,V7_QUALIFICATION_CHECK} from './editorial-distillation/rejected-qualification';
import {freezeCase,hash,MODELS} from './editorial-distillation/v7-comparison';
import {admitModelOperation} from '../apps/worker/src/v1-intelligence/model-capacity';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const options={schema:{type:'object',properties:{},required:[],additionalProperties:false}};
it('prepares independent writer and model-only verifier comparisons without inference',async()=>{
 const corpus=read('benchmarks/editorial-distillation/corpus.json'),recorded=read('benchmarks/editorial-distillation/v7-results-2026-11-03.json'),layoutTrial=read('benchmarks/editorial-distillation/v7-evidence-results-2026-11-03.json'),pricing=read('benchmarks/editorial-distillation/qualification-pricing-2026-11-03.json');
 const capability=(id:string)=>{const m=pricing.models.find((m:any)=>m.id===id);if(!m)throw Error('UNKNOWN_MODEL');return {...m,maxOutputTokens:4000,source:pricing.source+' '+pricing.checkedAt};};
 const writer:any[]=[],verifier:any[]=[];
 for(const c of corpus.cases.filter((c:any)=>c.split==='development')){
  const frozen=freezeCase(corpus,c.id),retained=recorded.records.find((r:any)=>r.label===c.id+'-v7'&&r.stage==='editor');
  for(const variant of ['baseline','qualifications'] as const){let request:any;await expect(generateBriefing(frozen.input,{async complete(r){request=r;throw Error('OFFLINE_CAPTURE_NO_INFERENCE');}},MODELS,{promptVersion:7})).rejects.toThrow('OFFLINE_CAPTURE_NO_INFERENCE');
   expect(request).toEqual(retained.request);
   request={...request,system:variant==='baseline'?v7System('editor'):v7System('editor','qualifications')};
   expect(request).toEqual({...retained.request,system:variant==='baseline'?v7System('editor'):v7System('editor','qualifications')});
   const admission=admitModelOperation(request.model,request,options.schema,capability(request.model),request.maxTokens);expect(admission.fits).toBe(true);
   writer.push({id:c.id+'-'+variant,caseId:c.id,language:c.feed.language,variant,evidenceHash:frozen.evidenceHash,requestHash:hash(request),request,reservationUsd:admission.reservationCostUsd});
  }
 }
 for(const r of layoutTrial.records.filter((r:any)=>r.layout==='shared')){for(const model of ['openai/gpt-4.1-mini','openai/gpt-4.1']){
  const request={...r.request,model};expect(request.system).toBe(VERIFY_SYSTEM_V7);expect(isDeepStrictEqual({...request,model:r.request.model},r.request)).toBe(true);
  const admission=admitModelOperation(model,request,options.schema,capability(model),request.maxTokens);expect(admission.fits).toBe(true);
  verifier.push({id:r.id+'-'+model.replaceAll('/','-'),inputId:r.id,model,kind:r.kind,language:r.language,requestHash:hash(request),request,indexToCase:r.indexToCase,reservationUsd:admission.reservationCostUsd});
 }}
 expect(writer).toHaveLength(8);const actual=read('benchmarks/editorial-distillation/v7-qualification-results-2026-11-03.json');for(const row of writer)expect(row.request).toEqual(actual.records.find((r:any)=>r.id===row.id).request);expect(verifier).toHaveLength(8);expect(DEFAULT_ENGINE.promptVersion).toBe(4);
 const writerExposure=writer.reduce((n,r)=>n+r.reservationUsd,0),verifierExposure=verifier.reduce((n,r)=>n+r.reservationUsd,0);expect(writerExposure).toBeLessThan(.65);expect(verifierExposure).toBeLessThan(.4);
 const claims=read('benchmarks/editorial-distillation/v7-qualification-controls.json');for(const c of claims.cases){const sources=c.sourceIds.map((id:string)=>corpus.sources.find((s:any)=>s.article.id===id).article);expect(sources.some((s:any)=>s.text.includes(c.essentialEvidence))).toBe(true);}
 const old=recorded.records.filter((r:any)=>['editor','verify'].includes(r.stage));const uncachedCost=(model:string,input:number,output:number)=>{const c=capability(model);return input*c.inputUsdPerToken+output*c.outputUsdPerToken;};
 const projection=[4,7].map(version=>{const calls=old.filter((r:any)=>r.label.endsWith('-v'+version));return {version,originalEstimatedUncachedUsd:calls.reduce((n:number,c:any)=>n+uncachedCost(c.request.model,c.response.inputTokens,c.response.outputTokens),0),replacementEstimatedUncachedUsd:calls.reduce((n:number,c:any)=>n+uncachedCost(c.stage==='verify'?'openai/gpt-4.1':c.request.model,c.response.inputTokens,c.response.outputTokens),0),qualification:'Counterfactual on old token usage, not actual stronger-model cost, latency or accuracy; repairs excluded.'};});
 const summary={phase:'OFFLINE_REQUEST_PREPARATION',subsequentWriterResults:'v7-qualification-results-2026-11-03.json',baseCommit:'c4cfa04',writer:{calls:8,maximumReservationUsd:writerExposure,proposedCeilingUsd:.65,variable:'Existing disabled qualification check only; no prompt rewrite, layout change or verifier calls',cases:writer.map(({request,...r})=>r),qualificationCheckHash:hash(V7_QUALIFICATION_CHECK),semanticResult:null},strongerVerifier:{calls:8,maximumReservationUsd:verifierExposure,proposedCeilingUsd:.4,baseline:'openai/gpt-4.1-mini',candidate:'openai/gpt-4.1',variable:'Model only; same V7 verifier and shared evidence',hypothesis:'Larger parent model may discriminate better; not assumed or qualified.',projection,semanticResult:null},paidCalls:0,actualUsd:0,fullPipelineCost:null,fullPipelineLatency:null,adoption:'KEEP_V4_V7_UNQUALIFIED',sourceAuthority:'Provisional source-linked engineering expectations, not human ground truth',frozenSourceCorpusHash:hash(corpus)};
 mkdirSync('.local-reports/v7-writer-qualification',{recursive:true});writeFileSync('.local-reports/v7-writer-qualification/requests.json',JSON.stringify({writer,verifier},null,2));writeFileSync('benchmarks/editorial-distillation/v7-qualification-offline.json',JSON.stringify(summary,null,2)+'\n');
});
