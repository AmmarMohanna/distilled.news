import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {boundedCompletion,cloudflareCompletionBody,structuredCompletionBody} from '../apps/worker/src/ai';
import {modelOptionsForRoute,type LlmRoute} from '../apps/worker/src/v1-intelligence/provider-routing';
import {admitModelOperation,modelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {confirmCloudflareCharge} from './cloudflare-evaluation-ledger';
import {hash,assertNewsBudget} from './news-end-to-end';
import type {Env} from '../apps/worker/src/types';
import type {EvaluationEvidenceTransport} from '../apps/worker/src/v1-intelligence/model';

export const newsRoot='.local-reports/news-end-to-end';
export const loadNews=(path:string)=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
export function saveNews(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
const accountId='openrouter-distilled-news-staging',cfAccount='e32b564514d4f9b9e383b7dd30dbb026';
/** Operator-only: one serial, request-bound financial operation per actual question.
 * Previously admitted questions are returned from saved settled results, never sent twice. */
export function newsEvaluationTransport(env:Env,options:{executionScope?:'PRIMARY_PIPELINE'|'AI_CURATED_DOWNSTREAM_CONTROL';correctnessOnly?:boolean}={}):EvaluationEvidenceTransport & {close():Promise<void>} {
 const executionScope=options.executionScope??'PRIMARY_PIPELINE',correctnessOnly=options.correctnessOnly===true,newsRoot=correctnessOnly?'.local-reports/news-correctness-openrouter':'.local-reports/news-end-to-end';
 const approval=loadNews(newsRoot+'/approval.json'),manifest=loadNews(newsRoot+'/manifest.json');
 const expected=correctnessOnly?{authorization:'USER_AUTHORIZED_OPENROUTER_CORRECTNESS_12_CALLS_1_50',maxCalls:12,maxReservationsUsd:1.5}:{authorization:'USER_AUTHORIZED_END_TO_END_24_CALLS_2_50',maxCalls:24,maxReservationsUsd:2.5};
 if(approval.authorization!==expected.authorization||approval.corpusHash!==manifest.corpusHash||approval.maxCalls!==expected.maxCalls||approval.maxReservationsUsd!==expected.maxReservationsUsd||!Number.isFinite(Date.parse(approval.validFrom))||!Number.isFinite(Date.parse(approval.validUntil))||Date.parse(approval.validUntil)-Date.parse(approval.validFrom)!==4*3600000)throw Error('NEWS_WORKFLOW_AUTHORIZATION_REQUIRED');
 const runId=manifest.corpusHash.slice(0,20),feedId=(correctnessOnly?'news-correctness:':'news-e2e:')+runId,runHash=hash({corpusHash:manifest.corpusHash,approval});
 const ledgerConfig=join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml');
 const db=evaluationD1('DYNAMIC_SERVER_SIDE_CREDENTIAL',async(url,init)=>{
  let config=readFileSync(ledgerConfig,'utf8');const expiration=config.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
  if(expiration&&Date.parse(expiration)<Date.now()+300000){execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','whoami'],{timeout:60000,stdio:'pipe'});config=readFileSync(ledgerConfig,'utf8')}
  const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!token)throw Error('EVALUATION_LEDGER_CREDENTIAL_REQUIRED');return fetch(url,{...init,headers:{...init?.headers,authorization:'Bearer '+token}});
 }) as unknown as D1Database;
 mkdirSync(newsRoot,{recursive:true});const lock=newsRoot+'/execution.lock',fd=openSync(lock,'wx');try{writeFileSync(fd,JSON.stringify({pid:process.pid,runHash,createdAt:new Date().toISOString()}));fsyncSync(fd)}finally{closeSync(fd)}
 let tail=Promise.resolve();
 const admission:EvaluationEvidenceTransport['admission']=(route,payload,schema,output)=>{const cap=route.task==='editorial'?12288:route.task==='verification'?8192:4096,known=modelCapability(route.identity);return admitModelOperation(route.identity,payload,schema,known?{...known,maxOutputTokens:cap,source:known.source+'; isolated evaluation output cap, not live qualification'}:undefined,Math.min(output??cap,cap))};
 const complete:EvaluationEvidenceTransport['complete']=request=>{
  const task=async()=>{
   const {route,phase,payload,schema}=request;if(correctnessOnly&&route.provider!=='openrouter')throw Error('CORRECTNESS_RUN_OPENROUTER_ONLY');if(!['cloudflare','openrouter'].includes(route.provider)||route.model!=='openai/gpt-4.1')throw Error('NEWS_MODEL_OUTSIDE_APPROVAL');
   const envelope=admission(route,payload,schema,request.limits.maxOutputTokens);if(!envelope.fits)throw Error(envelope.reason);
   const body=route.provider==='cloudflare'?cloudflareCompletionBody(route.identity,JSON.stringify(payload),schema,envelope.maxOutputTokens):structuredCompletionBody(route.identity,JSON.stringify(payload),schema,envelope.maxOutputTokens),requestHash=hash(body),id=feedId+':'+route.provider+':'+requestHash,prefix=newsRoot+'/'+route.provider+'-'+requestHash.slice(0,20);
   if(existsSync(prefix+'-accounted.json')){const saved=loadNews(prefix+'-accounted.json'),receipt=await db.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(id).first<any>();if((saved.executionScope??(existsSync(newsRoot+'/execution-scopes.json')?loadNews(newsRoot+'/execution-scopes.json').operations[saved.id]:undefined)??'PRIMARY_PIPELINE')!==executionScope)throw Error('NEWS_EXECUTION_SCOPE_MISMATCH');if(!receipt||receipt.token!==saved.token||receipt.reported!==1||receipt.cost_usd!==saved.costUsd||saved.requestHash!==requestHash||saved.model!==route.identity)throw Error('NEWS_SAVED_RECEIPT_MISMATCH');if(saved.errorCode)throw Error(saved.errorCode);return {result:saved.result,usage:saved.usage}}
   if(existsSync(prefix+'-intent.json'))throw Error('PRIOR_NEWS_INTENT_REQUIRES_RECEIPT_RECOVERY');
   const readPrior=()=>db.prepare('SELECT r.id,r.reserved_cost_usd AS reservedUsd,s.cost_usd AS costUsd,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.feed_id=? AND r.account_id=?').bind(feedId,accountId).all<any>();let prior=await readPrior();assertNewsBudget(prior.results.map(r=>({...r,settled:r.reported===1})),envelope.reservationCostUsd,expected);
   const trigger=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first<any>();if(!trigger?.sql?.includes('workflow.maxNewOperations'))throw Error('NEWS_WORKFLOW_MIGRATION_PERMISSION_REQUIRED');
   // Never overlap, renew or edit a historical grant. Wait for its immutable
   // end before installing this already-approved exact downstream question.
   let scopeWaitMs=0;for(;;){const now=Date.now();if(now>=Date.parse(approval.validUntil))throw Error('NEWS_WORKFLOW_WINDOW_EXPIRED');const latest=await db.prepare('SELECT MAX(valid_until) AS until FROM v1_model_spending_authorizations WHERE account_id=?').bind(accountId).first<any>();const until=Math.max(Date.parse(latest?.until??'1970-01-01'),Date.parse(approval.validFrom)),wait=until-now;if(wait<=0)break;console.info(JSON.stringify({type:'NEWS_SCOPE_WAIT',until:new Date(until).toISOString(),remainingMs:wait}));const sleepStarted=performance.now();await new Promise(r=>setTimeout(r,Math.min(wait+50,30000)));scopeWaitMs+=performance.now()-sleepStarted}
   prior=await readPrior();assertNewsBudget(prior.results.map(r=>({...r,settled:r.reported===1})),envelope.reservationCostUsd,expected);
   if(route.provider==='cloudflare'){
    const path=join(process.env.APPDATA!,'xdg.config/cloudflare/config/default.json');let auth=loadNews(path);
    if(Date.parse(auth.expiration_time)<Date.now()+600000){execFileSync(process.execPath,['.local-reports/tool-cache/_npx/3e0f6a29a5370fd7/node_modules/cf/bin/cf','ai-gateway','gateways','list'],{timeout:60000,stdio:'pipe',env:{...process.env,CI:'1',CLOUDFLARE_ACCOUNT_ID:cfAccount}});auth=loadNews(path)}
    env.CLOUDFLARE_AI_GATEWAY_TOKEN=auth.oauth_token;
   }
   const started=Date.now(),createdAt=new Date(started).toISOString(),validUntil=new Date(started+60000).toISOString();
   const grant={id:id+':grant'+(correctnessOnly?':'+started:''),accountId,modelIds:[route.identity],validFrom:createdAt,validUntil,maxExposureUsd:73,maxConcurrentOperations:51,evaluationScope:{feedId,manifestHash:runHash,operations:[{id,model:route.identity,requestHash}],maxNewSpendingUsd:envelope.reservationCostUsd,maxNewOperations:1,maxConcurrentOperations:1 as const,maxLifetimeExposureUsd:73,maxPerOperationUsd:.35,workflow:{id:runHash,maxNewOperations:expected.maxCalls,maxNewSpendingUsd:expected.maxReservationsUsd}}};
   const reservation={id,accountId,model:route.identity,feedId,token:randomUUID(),reservedCostUsd:envelope.reservationCostUsd,leaseUntil:started+240000,createdAt,evaluation:{manifestHash:runHash,requestHash}};
   saveNews(prefix+'-intent.json',{executionScope,grant,reservation,requestHash,phase,payload,schema,body,state:'PREPARED'});try{await authorizeModelSpending(db,grant);await reserveModelSpending(db,reservation)}catch(error){saveNews(prefix+'-admission-error.json',{at:new Date().toISOString(),error:String(error),providerRequestSent:false});throw error}saveNews(prefix+'-intent.json',{executionScope,grant,reservation,requestHash,phase,payload,schema,body,state:'ADMITTED'});
   let calls=0,networkMs:number|undefined,usage:any,result:any,errorCode:string|undefined;const endpoint=route.provider==='cloudflare'?'https://api.cloudflare.com/client/v4/accounts/'+cfAccount+'/ai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';
   const fetcher:typeof fetch=async(url,init)=>{
    if(init?.method==='GET'){const raw=loadNews(prefix+'-response.json'),allowed='https://api.cloudflare.com/client/v4/accounts/'+cfAccount+'/ai-gateway/gateways/default/logs/'+raw.headers['cf-aig-log-id'];if(route.provider!=='cloudflare'||String(url)!==allowed)throw Error('UNBOUND_NEWS_METADATA_READ');return fetch(url,init)}
    if(String(url)!==endpoint||hash(JSON.parse(String(init?.body)))!==requestHash||++calls!==1||Date.now()>=Date.parse(validUntil)||Date.now()>=reservation.leaseUntil||Date.now()>=Date.parse(approval.validUntil))throw Error('NEWS_PAID_REQUEST_FENCE');
    const tick=performance.now(),response=await fetch(url,init),raw=await response.clone().text();networkMs=performance.now()-tick;saveNews(prefix+'-response.json',{status:response.status,headers:Object.fromEntries(['cf-aig-log-id','x-generation-id','x-request-id'].map(k=>[k,response.headers.get(k)])),raw});return response;
   };
   const modelTick=performance.now();try{result=await boundedCompletion({...modelOptionsForRoute(env,route,fetcher),timeoutMs:120000,usageRecorder:async record=>{usage=record}},feedId,phase==='SYNTHESIS'?'summary':'event_review',phase,JSON.stringify(payload),schema,{maxOutputTokens:envelope.maxOutputTokens,signal:request.limits.signal,uniqueJsonKeys:true})}catch(e){errorCode=e instanceof Error?e.message:'UNKNOWN_NEWS_FAILURE'}
   const responseAndValidationMs=performance.now()-modelTick;let costUsd=usage?.reportedCostUsd,gatewayLogId:string|undefined,billingMs=0;
   saveNews(prefix+'-unsettled.json',{requestHash,model:route.identity,phase,result,errorCode,usage,networkMs,responseAndValidationMs,calls});
   if(route.provider==='cloudflare'){
    const old=loadNews('.local-reports/cloudflare-gpt41/live-results.json').rows.filter((r:any)=>r.route==='cloudflare'),previous=prior.results.map(r=>{const local=loadNews(newsRoot+'/'+(r.id.includes(':cloudflare:')?'cloudflare':'openrouter')+'-'+r.id.split(':').at(-1).slice(0,20)+'-accounted.json');return local}).filter(r=>r.route==='cloudflare');
    const tick=performance.now(),confirmed=await confirmCloudflareCharge(prefix,async()=>{const path=join(process.env.APPDATA!,'xdg.config/cloudflare/config/default.json');let auth=loadNews(path);if(Date.parse(auth.expiration_time)<=Date.now()){execFileSync(process.execPath,['.local-reports/tool-cache/_npx/3e0f6a29a5370fd7/node_modules/cf/bin/cf','ai-gateway','gateways','list'],{timeout:60000,stdio:'pipe',env:{...process.env,CI:'1',CLOUDFLARE_ACCOUNT_ID:cfAccount}});auth=loadNews(path)}return auth.oauth_token},[...old,...previous],envelope.reservationCostUsd);costUsd=confirmed.costUsd;gatewayLogId=confirmed.gatewayLogId;billingMs=performance.now()-tick;
   }
   if(typeof costUsd!=='number'||!Number.isFinite(costUsd)||costUsd<0||calls!==1)throw Error('UNKNOWN_NEWS_ACCOUNTING_NO_FURTHER_CALLS');
   await settleModelSpending(db,id,reservation.token,{costUsd,reported:true});
   const paidUsage={tokensIn:usage?.inputTokens??0,tokensOut:usage?.outputTokens??0,cost:costUsd,confirmed:true};
   const row={executionScope,id,token:reservation.token,route:route.provider,model:route.identity,phase,requestHash,result,errorCode,usage:paidUsage,networkMs,responseAndValidationMs,billingMs,scopeWaitMs,calls,costUsd,reservedUsd:envelope.reservationCostUsd,settled:true,gatewayLogId};saveNews(prefix+'-accounted.json',row);
   console.info(JSON.stringify({type:'NEWS_PAID_OPERATION',route:route.provider,phase,costUsd,responseAndValidationMs,billingMs,errorCode}));if(errorCode)throw Error(errorCode);return {result,usage:paidUsage};
  };
  const pending=tail.then(task);tail=pending.then(()=>{},()=>{});return pending;
 };
 return {admission,complete,close:async()=>{await tail;if(readdirSync(newsRoot).some(f=>f.endsWith('-intent.json')&&!existsSync(join(newsRoot,f.replace('-intent.json','-accounted.json')))))throw Error('NEWS_LOCK_RETAINED_FOR_UNCONFIRMED_OPERATION');unlinkSync(lock)}};
}
