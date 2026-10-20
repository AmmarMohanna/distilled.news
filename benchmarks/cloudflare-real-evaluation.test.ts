import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {admitModelOperation,modelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';
import {boundedCompletion,structuredCompletionBody} from '../apps/worker/src/ai';
import {workersAiRequest} from '../apps/worker/src/workers-ai';
import {withProviderReceiptSink} from '../apps/worker/src/provider-receipt';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from '../apps/worker/src/v1-intelligence/construction-transport';
import {extractClaimMentions} from '../apps/worker/src/v1-intelligence/claims';
import {parseConstruction} from '../apps/worker/src/v1-intelligence/semantic-construction';
import {createStoredEvidenceModel} from '../apps/worker/src/v1-intelligence/model';
import {verificationWire} from '../apps/worker/src/v1-intelligence/writer-wire';
import {decidePublicationPackets} from '../apps/worker/src/v1-intelligence/publication-validation';
const root='.local-reports/cloudflare-comparison';
const load=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
async function fixture(){
 const saved=load('benchmarks/validation-contract-real-model-results.json');
 const positive=saved.cases.find((c:any)=>c.caseId==='T01'),negative=saved.cases.find((c:any)=>c.caseId==='T04');
 const revision:any={id:positive.question[0].context[0].evidenceRevisionId,feedId:'isolated-provider-evaluation',body:positive.question[0].context[0].text,contentHash:hash(positive.question[0].context),acceptedAt:'2026-10-03T12:00:00Z'};
 const {mentions}=await extractClaimMentions(revision),input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[]};
 const construction=constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION,source:{id:revision.id,text:revision.body},claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,span:m.span,certainty:m.certainty,attribution:m.attribution}))});
 const model=createStoredEvidenceModel({V1_SYNTHESIS_MODEL_ENABLED:'true',V1_PUBLICATION_VALIDATION_CONTRACT:'EVIDENCE_GROUNDED_V2',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE_NOT_CREDENTIAL'} as any)!;
 const verification=model.verificationPayload!(negative.question),wire=verificationWire(negative.question,{requireReaderNovelty:true,requireFullEntailment:true,validationContract:'EVIDENCE_GROUNDED_V2'});
 const packets=[];
 for(const provider of ['OPENROUTER','WORKERS_AI'] as const)for(const task of ['construction','verification'] as const){
  const model=provider==='WORKERS_AI'?'workers_ai:@cf/qwen/qwen3-30b-a3b-fp8':task==='construction'?'openai/gpt-4.1':'openai/gpt-4.1-mini';
  const payload=task==='construction'?construction.state:verification.payload,schema=task==='construction'?construction.schema:verification.schema;
  const admission=admitModelOperation(model,payload,schema,modelCapability(model),4096);
  expect(admission.fits).toBe(true);expect(admission.requestBytes).toBeLessThanOrEqual(28672);expect(admission.reservationCostUsd).toBeLessThanOrEqual(.125);
  const request=provider==='WORKERS_AI'?{model:model.replace('workers_ai:',''),input:workersAiRequest(JSON.stringify(payload),schema,4096)}:structuredCompletionBody(model,JSON.stringify(payload),schema,4096);
  packets.push({provider,model,task,payload,schema,requestHash:hash(request),admission});
 }
 return {packets,construction,mentions,input,negative,wire};
}
it('freezes the four-call compatibility phase without inference',async()=>{
 mkdirSync(root,{recursive:true});const f=await fixture();const manifest={schema:'distilled-provider-qualification-v1',phase:'A',featureBase:'a573320',maxCalls:4,maxTotalApprovedCalls:24,maxTotalApprovedUsd:3,maxPerCallUsd:.125,maxParallel:1,workersAiQualification:false,sourceLabels:'Existing frozen T01/T04 controlled regression cases; not independent human gold',packets:f.packets};
 const path=root+'/phase-a-manifest.json';if(existsSync(path))expect(load(path)).toEqual(manifest);else durable(path,manifest);
 console.log(JSON.stringify({phase:'A',manifestHash:hash(manifest),calls:4,reservationUpperBoundUsd:f.packets.reduce((n,p)=>n+p.admission.reservationCostUsd,0),paidCalls:0}));
});
it.skipIf(!existsSync(root+'/WORKERS_AI-construction-native-response.json'))('replays saved real native billing units offline without settling the hold',async()=>{
 const f=await fixture(),p=f.packets.find(p=>p.provider==='WORKERS_AI'&&p.task==='construction')!,native=JSON.parse(load(root+'/WORKERS_AI-construction-native-response.json').raw).result;
 let usage:any;const receipts:any[]=[];
 const result=await withProviderReceiptSink(async r=>{receipts.push(r)},()=>boundedCompletion({accountId:'',gatewayId:'',apiKey:'',model:p.model,provider:'WORKERS_AI',env:{AI:{run:async()=>native}},usageRecorder:async u=>{usage=u}},'offline-native-replay','event_review','SEMANTIC_CONSTRUCTION',JSON.stringify(p.payload),p.schema,{maxOutputTokens:4096,signal:new AbortController().signal,uniqueJsonKeys:true}));
 expect(parseConstruction(f.construction.decode(result),f.mentions,f.input,{scorer:p.model,policyVersion:'saved-native-replay'}).groups).toHaveLength(1);
 expect(receipts.find(r=>r.stage==='USAGE')?.reportedBillingUnits).toEqual({unit:'NEURON',quantity:native.usage.neurons});expect(usage.reportedCostUsd).toBeUndefined();expect(usage.estimatedCostUsd).toBeCloseTo(native.usage.neurons*.000011,12);
 durable(root+'/native-billing-replay.json',{mode:'OFFLINE_REPLAY_OF_REAL_RESPONSE',newProviderCalls:0,receipts,usage,dollarSettlementConfirmed:false});
});
it.skipIf(process.env.DISTILLED_REAL_CLOUDFLARE_EVALUATION!=='APPROVED_3_USD_24_CALLS')('executes approved real requests once, with durable scope and no retries',async()=>{
 const f=await fixture(),manifest=load(root+'/phase-a-manifest.json'),manifestHash=hash(manifest),runId=manifestHash.slice(0,20),feedId='provider-evaluation:'+runId;
 expect(f.packets).toEqual(manifest.packets);expect(manifest.maxCalls).toBe(4);expect(manifest.maxTotalApprovedUsd).toBe(3);expect(manifest.maxParallel).toBe(1);
 const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('CLOUDFLARE_AUTH_REQUIRED');
 const varsPath=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!varsPath)throw Error('OPENROUTER_VARS_PATH_REQUIRED');
 const key=readFileSync(varsPath,'utf8').match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('OPENROUTER_KEY_REQUIRED');
 const db=evaluationD1(token) as unknown as D1Database,accountId='openrouter-distilled-news-staging';
 const operation=(p:typeof f.packets[number])=>'provider-evaluation:'+runId+':'+p.provider+':'+p.task;
 // Only the approved financial authorization guard is installed in the evaluation ledger.
 // No application deployment, canonical feed mutation or historical row rewrite.
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first())await db.prepare(readFileSync('apps/worker/migrations/0065_model_evaluation_scope.sql','utf8').replace(/^\s*--[^\n]*$/gm,'')).run();
 const grantPath=root+'/phase-a-grant.json';let grant:any;
 if(existsSync(grantPath))grant=load(grantPath);else{
  const held=await db.prepare('SELECT COUNT(*) AS n FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? AND COALESCE(s.reported,0)=0').bind(accountId).first<{n:number}>();
  const now=new Date().toISOString();grant={id:'provider-evaluation:'+runId,accountId,modelIds:[...new Set(f.packets.map(p=>p.model))],validFrom:now,validUntil:new Date(Date.now()+4*3600000).toISOString(),maxExposureUsd:73,maxConcurrentOperations:held!.n+1,evaluationScope:{feedId,manifestHash,operations:f.packets.map(p=>({id:operation(p),model:p.model,requestHash:p.requestHash})),maxNewSpendingUsd:3,maxNewOperations:4,maxConcurrentOperations:1,maxLifetimeExposureUsd:73}};durable(grantPath,grant);
 }
 await authorizeModelSpending(db,grant);
 const rows:any[]=existsSync(root+'/phase-a-results.json')?load(root+'/phase-a-results.json').rows:[];
 for(const p of f.packets){
  const prefix=root+'/'+p.provider+'-'+p.task,intentPath=prefix+'-intent.json';if(existsSync(intentPath))throw Error('PRIOR_INTENT_NO_AUTOMATIC_REISSUE:'+p.provider+':'+p.task);
  const r={id:operation(p),accountId,feedId,model:p.model,token:randomUUID(),reservedCostUsd:p.admission.reservationCostUsd,leaseUntil:Date.now()+240000,createdAt:new Date().toISOString(),evaluation:{manifestHash,requestHash:p.requestHash}};
  durable(intentPath,{state:'PREPARED',reservation:r});await reserveModelSpending(db,r);durable(intentPath,{state:'ADMITTED',reservation:r});
  let calls=0,usage:any,result:any,errorCode:string|undefined,validation:any;const receipts:any[]=[];
  const fetcher:typeof fetch=async(url,init)=>{if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||++calls!==1||hash(JSON.parse(String(init?.body)))!==p.requestHash)throw Error('EVALUATION_REQUEST_CHANGED');return fetch(url,init)};
  const binding={run:async(model:string,input:Record<string,unknown>)=>{
   if(++calls!==1||hash({model,input})!==p.requestHash)throw Error('EVALUATION_REQUEST_CHANGED');
   const response=await fetch('https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026/ai/run/'+model,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});
   const raw=await response.text();durable(prefix+'-native-response.json',{status:response.status,ray:response.headers.get('cf-ray'),requestId:response.headers.get('x-request-id'),raw});const envelope=JSON.parse(raw);
   if(!response.ok||!envelope.success)throw Error('CLOUDFLARE_INFERENCE_REJECTED:'+response.status);return envelope.result;
  }};
  const start=performance.now();try{
   result=await withProviderReceiptSink(async receipt=>{receipts.push(receipt);durable(prefix+'-receipts.json',receipts)},()=>boundedCompletion({accountId:'',gatewayId:'',apiKey:p.provider==='OPENROUTER'?key:'',provider:p.provider,model:p.model,env:{AI:binding},fetcher,timeoutMs:180000,usageRecorder:async u=>{usage=u}},feedId,'event_review',p.task==='construction'?'SEMANTIC_CONSTRUCTION':'GROUNDING',JSON.stringify(p.payload),p.schema,{maxOutputTokens:4096,signal:AbortSignal.timeout(180000),uniqueJsonKeys:true}));
   if(p.task==='construction'){
    const construction=parseConstruction(f.construction.decode(result),f.mentions,f.input,{scorer:p.model,policyVersion:'real-provider-evaluation-v1'});
    validation={valid:construction.groups.length===1&&construction.groups[0].structuralRelation==='NEW_STORYLINE'&&construction.groups[0].claimMentionIds.length===f.mentions.length,groups:construction.groups.length,coveredMentions:construction.groups.flatMap(g=>g.claimMentionIds).length};
   }else{
    const decoded=f.wire.decode(result),decision=decidePublicationPackets(f.negative.question,[{claims:f.negative.question,result:decoded}]).decision;
    validation={valid:decision.status==='REJECT',decision,invalidAccept:decision.status==='ACCEPT'};
   }
  }catch(e){errorCode=e instanceof Error?e.message:'UNKNOWN_EVALUATION_FAILURE'}
  const usageReceipt=receipts.find(x=>x.stage==='USAGE'&&x.reportedCostUsd!==undefined&&x.generationId);
  const confirmed=Boolean(usageReceipt&&usage?.reportedCostUsd===usageReceipt.reportedCostUsd);
  const row={provider:p.provider,model:p.model,task:p.task,operationId:r.id,requestHash:p.requestHash,wallMs:performance.now()-start,providerCalls:calls,usage,receipts,result,errorCode,validation,settled:false,reservedUsd:r.reservedCostUsd};
  durable(prefix+'-result.json',row);
  if(confirmed){await settleModelSpending(db,r.id,r.token,{costUsd:usage.reportedCostUsd,reported:true});row.settled=true;durable(prefix+'-result.json',row)}
  rows.push(row);const stopReason=!confirmed?'UNCONFIRMED_ACCOUNTING':errorCode?'MODEL_OR_VALIDATION_FAILURE':!validation?.valid?'QUALITY_CHECK_FAILED':null;
  durable(root+'/phase-a-results.json',{manifestHash,scope:'ISOLATED_NONPUBLISHING',rows,stopReason,productionQualified:false});
  console.log(JSON.stringify({provider:p.provider,task:p.task,providerCalls:calls,wallMs:row.wallMs,validation,errorCode,settled:row.settled,confirmedUsd:confirmed?usage.reportedCostUsd:null,stopReason}));
  if(stopReason)return;
 }
});
