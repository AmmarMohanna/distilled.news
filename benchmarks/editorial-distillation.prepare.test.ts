/** Offline preparation only. No provider adapter, credentials or live engine invocation. */
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {EDITOR_SYSTEM_V4,VERIFY_SYSTEM,CONSOLIDATE_SYSTEM,REPAIR_SYSTEM,editorUser} from '../packages/briefing/src/prompts';
import {prepareArticles,selectPrior,chunkArticles,DEFAULT_PREPARE} from '../packages/briefing/src/prepare';
import type {BriefingInput} from '../packages/briefing/src/types';
// @ts-expect-error Deliberately shared plain-JS offline comparison utility.
import {candidates,pairedRequest,auditPair,sha256} from './editorial-distillation/comparison.mjs';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
it('prepares exactly matched editorial comparisons from the frozen full-source corpus',()=>{
 const at=performance.now(),dir='benchmarks/editorial-distillation/',corpus=read(dir+'corpus.json');
 const snapshot={schemaVersion:1,promptVersion:4,baseRevision:corpus.baselineRevision,systems:{editor:EDITOR_SYSTEM_V4,verify:VERIFY_SYSTEM,consolidate:CONSOLIDATE_SYSTEM,repair:REPAIR_SYSTEM},prepare:DEFAULT_PREPARE,models:{editor:'openai/gpt-4.1',verifier:'openai/gpt-4.1-mini',repair:'openai/gpt-4.1'},configuration:{temperature:0.1,jsonMode:true,maxTokens:4000,retries:0},note:'Evaluation snapshot, not a routing or deployment change.'};
 if(process.env.FREEZE_EDITORIAL_BASELINE==='1')writeFileSync(dir+'baseline-v4.json',JSON.stringify(snapshot,null,2)+'\n');
 expect(read(dir+'baseline-v4.json')).toEqual(snapshot);
 const requests:any[]=[],preparation:any[]=[];
 for(const c of corpus.cases){
  const input:BriefingInput={feed:c.feed,windowStart:c.windowStart,windowEnd:c.windowEnd,prior:c.prior,articles:c.articleIds.map((id:string)=>corpus.sources.find((s:any)=>s.article.id===id).article)};
  const {prepared,skipped}=prepareArticles(input.articles);const prior=selectPrior(input.prior??[],prepared,new Date(input.windowEnd));
  const chunks=chunkArticles(prepared,90000);expect(chunks).toHaveLength(1);
  const baseline={model:'openai/gpt-4.1',system:EDITOR_SYSTEM_V4,user:editorUser({...input,prior,articles:prepared,promptVersion:4}),maxTokens:4000,temperature:0.1,jsonMode:true,retries:0};
  preparation.push({caseId:c.id,originalArticles:input.articles.length,originalCharacters:input.articles.reduce((n,a)=>n+a.text.length,0),preparedArticles:prepared.length,preparedCharacters:prepared.reduce((n,a)=>n+a.text.length,0),priorInput:c.prior.length,priorSelected:prior.length,skipped,referenceMap:prepared.map(s=>({ref:s.ref,id:s.id,alsoIds:s.alsoIds})),chunks:chunks.length});
  for(const candidateId of ['baseline',...candidates.map((x:any)=>x.id)]){
   const request=candidateId==='baseline'?baseline:pairedRequest(baseline,candidateId);if(candidateId!=='baseline')auditPair(baseline,request,candidateId);
   // Conservative byte upper bound at the repository's configured GPT-4.1 rates, not native admission or actual charges.
   const inputUpperBound=Buffer.byteLength(JSON.stringify(request),'utf8')+1024;
   requests.push({caseId:c.id,split:c.split,candidateId,request,requestSha256:sha256(request),identicalInputSha256:sha256(baseline.user),planningUpperUsd:(inputUpperBound*2+4000*8)/1e6});
  }
 }
 const initial=requests.filter(r=>r.split==='development');
 const summary={schemaVersion:1,status:'OFFLINE_PREPARED_NOT_MODEL_EVALUATED',corpusSha256:sha256(corpus),promptSnapshotSha256:sha256(snapshot),cases:corpus.cases.length,sources:corpus.sources.length,pairedCandidateComparisons:corpus.cases.length*candidates.length,preparedRequests:requests.length,initialDevelopmentCalls:initial.length,initialPlanningUpperUsd:initial.reduce((n,r)=>n+r.planningUpperUsd,0),pricingQualification:'Configured $2/$8 per million tokens; must refresh current pricing, obtain fresh explicit spending approval and pass native admission before any execution. This estimate is not a grant or reservation.',paidCalls:0,actualInferenceCostUsd:0,modelLatencyMs:null,preparationMs:performance.now()-at,candidates,preparation,limitations:corpus.limitations};
 mkdirSync('.local-reports/v3-editorial-distillation',{recursive:true});writeFileSync('.local-reports/v3-editorial-distillation/requests.json',JSON.stringify({summary,requests},null,2)+'\n');writeFileSync('.local-reports/v3-editorial-distillation/preparation.json',JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({cases:summary.cases,comparisons:summary.pairedCandidateComparisons,initialDevelopmentCalls:initial.length,initialPlanningUpperUsd:summary.initialPlanningUpperUsd,paidCalls:0}));
 expect(requests).toHaveLength(36);expect(initial).toHaveLength(12);
});
