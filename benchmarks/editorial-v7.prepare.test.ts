import {it,expect} from 'vitest';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {freezeCase,runFrozen,hash} from './editorial-distillation/v7-comparison';
import {prepareArticles,selectPrior} from '../packages/briefing/src/prepare';
import {editorUser,EDITOR_SYSTEM_V4,VERIFY_SYSTEM} from '../packages/briefing/src/prompts';
import {EDITOR_SYSTEM_V7,VERIFY_SYSTEM_V7} from '../packages/briefing/src/prompts-v7';
const corpus=JSON.parse(readFileSync('benchmarks/editorial-distillation/corpus.json','utf8'));
it('freezes matched V4/V7 requests without network, labels or changed evidence',async()=>{
 const requests:any[]=[];
 for(const c of corpus.cases){const f=freezeCase(corpus,c.id),{prepared}=prepareArticles(f.input.articles),prior=selectPrior(c.prior,prepared,new Date(c.windowEnd));for(const version of [4,7] as const){const user=editorUser({feed:c.feed,windowStart:c.windowStart,windowEnd:c.windowEnd,prior,articles:prepared,promptVersion:version});const request={model:'openai/gpt-4.1',system:version===4?EDITOR_SYSTEM_V4:EDITOR_SYSTEM_V7,user,maxTokens:4000,temperature:.1,jsonMode:true,retries:0};requests.push({caseId:c.id,split:c.split,version,evidenceHash:f.evidenceHash,requestHash:hash(request),request});}expect(requests.at(-1).request.user).toBe(requests.at(-2).request.user);}
 expect(requests).toHaveLength(24);const retained=JSON.parse(readFileSync('benchmarks/editorial-distillation/verifier-trial-2026-11-03.json','utf8'));
 const controls=retained.trials.filter((t:any)=>t.variant==='baseline'||t.candidateId==='baseline');
 // Baseline requests remain exact; only the system changes for V7.
 expect(controls).toHaveLength(2);
 const verifierRequests=controls.map((t:any)=>({baseline:t.request,candidate:{...t.request,system:VERIFY_SYSTEM_V7}}));
 mkdirSync('.local-reports/editorial-v7',{recursive:true});writeFileSync('.local-reports/editorial-v7/requests.json',JSON.stringify({requests,verifierRequests},null,2));
 writeFileSync('benchmarks/editorial-distillation/v7-offline.json',JSON.stringify({status:'OFFLINE_PREPARATION_ONLY',subsequentResults:'v7-results-2026-11-03.json',corpusHash:hash(corpus),editorRequests:requests.map(({request,...r})=>r),verifierRequestPairs:verifierRequests.length,verifierRequests:verifierRequests.length*2,paidCalls:0,actualUsd:0,quality:null,fullPipelineCost:null,fullPipelineLatency:null,adoption:'REVISE',reason:'Requires fresh authorized full-pipeline model evaluation; offline plumbing does not establish quality.'},null,2));
});
it('runs the real engine through the supplied port and records exact events, with no hidden provider',async()=>{const f=freezeCase(corpus,'quiet-repeat-en');const records:unknown[]=[];let n=0;const r=await runFrozen(f,7,{async complete(){n++;return {text:'{"items":[],"left_out":[{"sources":["S1"],"why":"repeated"}]}',inputTokens:1,outputTokens:1};}},async e=>{records.push(e);});expect(n).toBe(1);expect(r.result.items).toEqual([]);expect(r.publicationPersistence).toBe(false);expect(records).toHaveLength(3);f.input.articles[0].text+=' changed';await expect(runFrozen(f,4,{async complete(){throw Error('NO');}},async()=>{})).rejects.toThrow('EVIDENCE_CHANGED');});
