import {readFileSync,existsSync,writeFileSync,mkdirSync,readdirSync,openSync,closeSync,fsyncSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {authorizeModelSpending,modelSpendingStatements,settleModelSpending,spendingExposure} from '../apps/worker/src/v1-intelligence/model-spending';
import {boundedCompletion,structuredCompletionBody} from '../apps/worker/src/ai';
import {admitModelOperation,type ModelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';
import {prepareComparisonRequest,comparisonResponseModels,type CatalogModel,type Effort,type InitialState} from './v2-configuration-comparison';
import type {EvaluationEvidenceTransport} from '../apps/worker/src/v1-intelligence/model';
import {hash} from './news-end-to-end';
export const comparisonRoot='.local-reports/v2-model-comparison';
export const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export function save(p:string,v:unknown){writeFileSync(p,JSON.stringify(v,null,2));const fd=openSync(p,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
export function comparisonLedger(){return evaluationD1('dynamic',async(url,init)=>{const file=join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml');let config=readFileSync(file,'utf8');const expiry=config.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];if(expiry&&Date.parse(expiry)<Date.now()+180000){execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','whoami'],{stdio:'pipe',windowsHide:true,timeout:60000});config=readFileSync(file,'utf8')}const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('COMPARISON_LEDGER_AUTH_REQUIRED');return fetch(url,{...init,headers:{...init?.headers,authorization:'Bearer '+token}})}) as unknown as D1Database}
export function comparisonBudgetGuard(db:D1Database,feedId:string,next:number,validUntil:string){
 if(!Number.isFinite(next)||next<0||!Number.isFinite(Date.parse(validUntil)))throw Error('INVALID_COMPARISON_RESERVATION');
 const guard=randomUUID();return {guard,statement:db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN (SELECT COUNT(*) FROM v1_model_spending_reservations WHERE feed_id=?)<60 AND (SELECT COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=?)+?<=3 AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=? AND COALESCE(s.reported,0)=0) AND julianday('now')<julianday(?) THEN 1 ELSE 0 END`).bind(guard,feedId,feedId,next,feedId,validUntil)};
}
export async function createComparisonTransport(key:string,catalog:CatalogModel[]){
 if(process.env.DISTILLED_V2_COMPARISON_PAID!=='USER_APPROVED_3_USD_60_CALLS')throw Error('COMPARISON_EXPLICIT_APPROVAL_REQUIRED');
 mkdirSync(comparisonRoot,{recursive:true});const approvalPath=comparisonRoot+'/approval.json';
 // The operator supplies the already-approved immutable scope. Removing the
 // local manifest must never renew an expired four-hour authorization.
 if(!existsSync(approvalPath))throw Error('COMPARISON_APPROVED_MANIFEST_REQUIRED');
 const approval=load(approvalPath);if(approval.authorization!=='USER_APPROVED_3_USD_60_CALLS_FOUR_HOURS'||approval.maxCalls!==60||approval.maxUsd!==3||Date.now()>=Date.parse(approval.validUntil))throw Error('COMPARISON_APPROVAL_EXPIRED_OR_INVALID');
 const lock=comparisonRoot+'/execution.lock',lockFd=openSync(lock,'wx');writeFileSync(lockFd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));fsyncSync(lockFd);closeSync(lockFd);
 const db=comparisonLedger(),accountId='openrouter-distilled-news-staging',feedId='v2-model-comparison:'+approval.id,grantId=feedId+':authority';
 const priorGrant=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(grantId).first<{json:string}>();
 if(!priorGrant){const exposure=await spendingExposure(db,accountId,approval.validFrom);await authorizeModelSpending(db,{id:grantId,accountId,modelIds:approval.modelIds,validFrom:approval.validFrom,validUntil:approval.validUntil,maxExposureUsd:exposure.heldCostUsd+3,maxConcurrentOperations:3})}
 const capFor=(task:string)=>task==='editorial'||task==='verification'?12288:8192;
 const capability=(model:string,task:string):ModelCapability|undefined=>{const c=catalog.find(c=>c.id===model);if(!c)return undefined;const rates=[c.pricing,...c.pricing.overrides??[]];return {contextTokens:c.context_length,maxOutputTokens:Math.min(capFor(task),c.top_provider.max_completion_tokens),inputUsdPerToken:Math.max(...rates.map(r=>Number(r.prompt??c.pricing.prompt))),outputUsdPerToken:Math.max(...rates.map(r=>Number(r.completion??c.pricing.completion))),source:'Frozen OpenRouter catalog '+approval.validFrom+'; isolated candidate evaluation only'}};
 let tail=Promise.resolve();
 const forArm=(profile:string,initial:InitialState,effort:Effort,options:{disableThinkingFor?:string[]}={}):EvaluationEvidenceTransport=>{
 const admission:EvaluationEvidenceTransport['admission']=(route,payload,schema,output)=>admitModelOperation(route.identity,payload,schema,capability(route.identity,route.task),Math.min(output??capFor(route.task),capFor(route.task)));
 return {admission,complete:request=>{const work=async()=>{
  const {route,phase,payload,schema}=request,c=catalog.find(c=>c.id===route.identity);if(route.provider!=='openrouter'||!approval.modelIds.includes(route.identity)||!c)throw Error('COMPARISON_MODEL_OUTSIDE_APPROVAL');
  const envelope=admission(route,payload,schema,request.limits.maxOutputTokens);if(!envelope.fits)throw Error(envelope.reason);
  const trial=prepareComparisonRequest({...initial,profile,phase,model:route.identity,...(options.disableThinkingFor?.includes(route.identity)?{reasoningEnabled:false as const}:{effort:c.supported_parameters.includes('reasoning_effort')?effort:undefined}),catalog:c,body:structuredCompletionBody(route.identity,JSON.stringify(payload),schema,envelope.maxOutputTokens)});
  const prefix=comparisonRoot+'/'+profile+'-'+trial.operationHash.slice(0,24),id=feedId+':'+trial.operationHash;
  if(existsSync(prefix+'-settled.json')){const r=load(prefix+'-settled.json'),remote=await db.prepare('SELECT reported,cost_usd,token FROM v1_model_spending_settlements WHERE id=?').bind(id).first<any>();if(remote?.reported!==1||remote.token!==r.token||remote.cost_usd!==r.usage.cost)throw Error('COMPARISON_RECEIPT_MISMATCH');if(r.error&&!(r.error==='COMPARISON_RESPONSE_MODEL_IDENTITY_MISMATCH'&&existsSync(prefix+'-identity-recovery.json')&&comparisonResponseModels(load(prefix+'-response.json').raw).every(m=>m===route.identity)))throw Object.assign(Error(r.error),{paidUsage:r.usage});return {result:r.result,usage:r.usage}}
  if(existsSync(prefix+'-intent.json'))throw Error('COMPARISON_UNKNOWN_PRIOR_OPERATION');
  if(Date.now()>=Date.parse(approval.validUntil))throw Error('COMPARISON_APPROVAL_EXPIRED');
  const reservation={id,accountId,feedId,model:route.identity,token:randomUUID(),reservedCostUsd:Math.max(envelope.reservationCostUsd,trial.reservationUsd),leaseUntil:Date.now()+240000,createdAt:new Date().toISOString(),evaluation:{manifestHash:hash(approval),requestHash:trial.operationHash},providerLimits:{provider:'openrouter' as const,maxConcurrent:3,requestsPerMinute:20}};
  const budget=comparisonBudgetGuard(db,feedId,reservation.reservedCostUsd,approval.validUntil),guard=budget.guard,base=await modelSpendingStatements(db,reservation);
  save(prefix+'-intent.json',{reservation,phase,payload,schema,trial,state:'PREPARED',providerRequestSent:false});
  await db.batch([budget.statement,...base,db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)]);
  save(prefix+'-intent.json',{reservation,phase,payload,schema,trial,state:'ADMITTED',providerRequestSent:false});
  let usage:any,result:any,error:any,sent=0,rawCapture:Promise<void>|undefined;const tick=performance.now();
  try{result=await boundedCompletion({accountId:'',gatewayId:'',apiKey:key,provider:'OPENROUTER',model:route.identity,timeoutMs:180000,usageRecorder:async r=>{usage=r},onProviderReceipt:async receipt=>save(prefix+'-receipt-'+receipt.stage+'.json',receipt),fetcher:async(url,init)=>{
   if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||init?.method!=='POST'||++sent!==1||Date.now()>=Date.parse(approval.validUntil)||hash(JSON.parse(String(init.body)))!==hash(structuredCompletionBody(route.identity,JSON.stringify(payload),schema,envelope.maxOutputTokens)))throw Error('COMPARISON_SEND_FENCE');
   save(prefix+'-intent.json',{reservation,phase,payload,schema,trial,state:'SENT',providerRequestSent:true});const response=await fetch(url,{...init,body:JSON.stringify(trial.body)}),clone=response.clone();rawCapture=clone.text().then(raw=>{save(prefix+'-response.json',{status:response.status,headers:Object.fromEntries(['content-type','x-generation-id','x-request-id'].map(k=>[k,response.headers.get(k)])),raw})});return response;
  }},feedId,phase==='SYNTHESIS'?'summary':'event_review',phase,JSON.stringify(payload),schema,{maxOutputTokens:envelope.maxOutputTokens,signal:request.limits.signal,uniqueJsonKeys:true})}catch(e){error=e}
  await rawCapture?.catch(()=>{});
  const servedModels=existsSync(prefix+'-response.json')?comparisonResponseModels(load(prefix+'-response.json').raw):[];
  const normalized=(m:string)=>m.split('/').at(-1)!.toLowerCase().replace(/[-.]/g,'');const allowed=[route.identity,c.canonical_slug].map(normalized);if(!error&&(!servedModels.length||servedModels.some(m=>!allowed.includes(normalized(m)))))error=Error('COMPARISON_RESPONSE_MODEL_IDENTITY_MISMATCH');
  let cost=usage?.reportedCostUsd;
  if(typeof cost!=='number'&&error?.providerDiagnostic?.execution==='REJECTED_BEFORE_EXECUTION')cost=0;
  save(prefix+'-outcome.json',{error:error?.message,cause:String(error?.cause??''),diagnostic:error?.providerDiagnostic,result,usage,sent,wallMs:performance.now()-tick});
  if(sent!==1||typeof cost!=='number'||!Number.isFinite(cost)||cost<0)throw Error('COMPARISON_UNCERTAIN_CHARGE_STOP');
  await settleModelSpending(db,id,reservation.token,{costUsd:cost,reported:true});const paidUsage={tokensIn:usage?.inputTokens??0,tokensOut:usage?.outputTokens??0,cost,confirmed:true};
  const row={id,token:reservation.token,profile,model:route.identity,phase,effort:trial.body.reasoning?.enabled===false?'DISABLED':trial.body.reasoning_effort??'PROVIDER_DEFAULT',operationHash:trial.operationHash,initial,servedModels:[...new Set(servedModels)],result,error:error?.message,usage:paidUsage,wallMs:performance.now()-tick,reservedUsd:reservation.reservedCostUsd};save(prefix+'-settled.json',row);console.info(JSON.stringify({type:'V2_COMPARISON_PAID',profile,phase,model:route.identity,usd:cost,wallMs:row.wallMs,error:error?.message}));
  if(error)throw Object.assign(Error(error.message),{paidUsage});return {result,usage:paidUsage};
 };const pending=tail.then(work);tail=pending.then(()=>{},()=>{});return pending;}};
 };
 return {forArm,capability,approval,async close(){await tail;if(readdirSync(comparisonRoot).some(f=>f.endsWith('-intent.json')&&!existsSync(comparisonRoot+'/'+f.replace('-intent.json','-settled.json'))))throw Error('COMPARISON_UNKNOWN_OPERATION_LOCK_RETAINED');unlinkSync(lock)}};
}
