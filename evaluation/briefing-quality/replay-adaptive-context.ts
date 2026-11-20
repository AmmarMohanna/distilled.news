import {verificationWirePolicies} from './replay-policies';
/** No network, credentials or inference: replay only exact completed paid requests. */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {verifySourceBoundClaims} from '../../packages/briefing/src/source-bound-claims';
import {generateBriefing} from '../../packages/briefing/src/engine';
import {UsageMeter,type ModelRequest,type ModelResponse} from '../../packages/briefing/src/model';
globalThis.fetch=async()=>{throw Error('OFFLINE_REPLAY_NETWORK_FORBIDDEN')};

const dir=path.resolve(process.argv[2]??'.local-reports/integration/compact-paid-20261119-v5');
const read=(file:string)=>JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key=(q:ModelRequest)=>JSON.stringify({model:q.model,system:q.system,user:q.user,maxTokens:q.maxTokens,responseSchema:q.responseSchema??null});
const rows=fs.readFileSync(path.join(dir,'ledger.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const history=read('historical-writers.json'),cases=read('cases.json'),paidOutcomes=read('outcomes.json');
const seeds=new Map<string,{id:string;request:ModelRequest;response:ModelResponse}>();
for(const seed of history)seeds.set(key(seed.request),seed);
// Prefer the actual completed campaign's selected ancestry over earlier attempts.
for(const row of rows.filter(r=>r.state==='HISTORICAL_REUSE')){
 const seed=history.find((s:any)=>s.id===row.originalId);
 if(!seed||hash(seed.request)!==row.originalRequestHash)throw Error('HISTORICAL_RECEIPT_MISMATCH');
 seeds.set(key(seed.request),seed);
}
for(const row of rows.filter(r=>r.state==='SETTLED')){
 const raw=read(row.id+'.response.json'),request=read(row.id+'.request.json');
 if(raw.id!==row.generationId||raw.usage.cost!==row.costUsd||raw.choices[0].finish_reason==='length')throw Error('PAID_RECEIPT_MISMATCH');
 seeds.set(key(request),{id:row.id,request,response:{text:raw.choices[0].message.content,inputTokens:row.inputTokens,outputTokens:row.outputTokens,costUsd:0,finishReason:raw.choices[0].finish_reason}});
}
const proofReplay=cases.some((c:any)=>c.verificationProofPolicy==='compact-proofs-v1'||c.engineSnapshot?.input?.feed?.verificationProofPolicy==='compact-proofs-v1');
const schemaReplay=cases.some((c:any)=>c.schemaSharingPolicy==='source-definitions-v1'||c.engineSnapshot?.input?.feed?.schemaSharingPolicy==='source-definitions-v1');
if(schemaReplay&&cases.some((c:any)=>c.sourceInventoryPolicy||c.verificationSchemaPolicy||c.schemaSharingPolicy&&c.schemaSharingPolicy!=='source-definitions-v1'))throw Error('UNSUPPORTED_REPLAY_ARM');
const memoReplay=process.argv.includes('--with-source-memo');
const results=[];
for(const c of cases.filter((c:any)=>c.engineSnapshot||schemaReplay||proofReplay||c.pair&&c.id.endsWith('-original'))){
 const traces:Array<{requestHash:string;paidOperationId:string;verification:boolean;format:string;proofFormat:string}>=[];
 const port={complete:async(q:ModelRequest):Promise<ModelResponse>=>{
  const seed=seeds.get(key(q));if(!seed)throw Error('UNRECORDED_REQUEST: '+q.system.slice(0,50));
  traces.push({requestHash:hash(q),paidOperationId:seed.id,verification:q.system.startsWith('You are a meticulous source-grounded verifier.'),...verificationWirePolicies(q)});
  return {...seed.response,costUsd:0};
 }};
 if(c.engineSnapshot){
  const f=c.engineSnapshot,result=await generateBriefing({...f.input,feed:{...f.input.feed,verificationInputPolicy:'reader-unit-context-v2',...(memoReplay?{sourceIdentityReusePolicy:'within-briefing-v1' as const}:{})}},port,{...f.models,verifier:'openai/gpt-4.1'},{editorSourcePolicy:f.editorSourcePolicy,editorAccountingPolicy:f.editorAccountingPolicy,editorFailurePolicy:f.editorFailurePolicy,...c.engineOptions,citationCoverage:f.citationCoverage,noveltyGuard:f.noveltyGuard,noveltyPolicy:f.noveltyPolicy,...(f.architecture?{architecture:f.architecture}:{}),promptVersion:f.promptVersion??1,now:()=>new Date(f.input.windowEnd),prepare:{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01}});
  const previous=paidOutcomes.find((r:any)=>r.caseId===c.id&&r.system==='engine');
  if(previous.error||result.status!==previous.engineResult.status||JSON.stringify(result.items)!==JSON.stringify(previous.engineResult.items))throw Error('REAL_OUTPUT_DRIFT');
  results.push({caseId:c.id,kind:'retained-real-engine',stories:result.items.length,identicalPreviouslyPaidOutput:true,traces});
 }else{
  const result=Object.fromEntries(await verifySourceBoundClaims(port,new UsageMeter(),{model:'openai/gpt-4.1',language:c.language,items:c.items,sources:c.sources,prior:c.prior,context:c.context,independentSourceBindings:true,atomicReaderAssertions:true,verificationInputPolicy:'reader-unit-context-v2',sourceSchemaSharing:c.schemaSharingPolicy==='source-definitions-v1',compactProofs:c.verificationProofPolicy==='compact-proofs-v1'}));
  const previous=paidOutcomes.find((r:any)=>r.caseId===c.id);
  if(previous.error||JSON.stringify(result)!==JSON.stringify(previous.decisions))throw Error('CONTROL_DECISION_DRIFT');
  results.push({caseId:c.id,kind:'source-derived-control',language:c.language,identicalPreviouslyPaidDecision:true,traces});
 }
}
const reviews=results.flatMap(r=>r.traces.filter(t=>t.verification));
console.log(JSON.stringify({policy:proofReplay?'compact-proofs-v1':schemaReplay?'source-definitions-v1':'reader-unit-context-v2',newPaidCalls:0,newCostUsd:0,sourceMemoEnabled:memoReplay,sourceCasesHash:hash(cases),sourceLedgerHash:hash(fs.readFileSync(path.join(dir,'ledger.jsonl'),'utf8')),cases:results.length,matchedRecordedRequests:results.reduce((n,r)=>n+r.traces.length,0),originalVerificationRequests:reviews.filter(r=>r.format==='original').length,compactVerificationRequests:reviews.filter(r=>r.format==='compact-v1').length,compactProofRequests:reviews.filter(r=>r.proofFormat==='compact-proofs-v1').length,results,scope:'Exact recorded-response replay only, not new model assessments, independent news evaluation or fresh cost/latency measurement.'},null,2));
