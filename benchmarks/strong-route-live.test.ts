import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {prepareStrongComparison,evidenceHash,compareStrongRoutes,STRONG_ROUTES,type ComparisonRow} from './strong-route-comparison';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {boundedCompletion} from '../apps/worker/src/ai';
import {modelOptionsForRoute} from '../apps/worker/src/v1-intelligence/provider-routing';
import {withProviderReceiptSink} from '../apps/worker/src/provider-receipt';
const root='.local-reports/cloudflare-gpt41';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
function reusable(packets:Awaited<ReturnType<typeof prepareStrongComparison>>['packets']){
 const path='.local-reports/cloudflare-comparison/phase-a-results.json';if(!existsSync(path))return [];
 return packets.flatMap(p=>load(path).rows.filter((r:any)=>r.requestHash===p.requestHash&&r.model===p.model&&r.result&&r.validation?.valid).map((r:any)=>({route:p.route,caseId:p.caseId,requestHash:p.requestHash,model:p.model,wallMs:r.wallMs,settled:r.settled,...(r.settled?{costUsd:r.usage.reportedCostUsd}:{}),validation:r.validation,qualityReview:'PENDING' as const,source:'PRIOR_REAL_EXACT_REQUEST',priorOperationId:r.operationId,result:r.result})));
}
it('prepares the matched comparison, reuses exact real results and reports current blockers without inference',async()=>{
 mkdirSync(root,{recursive:true});const f=await prepareStrongComparison(),cached=reusable(f.packets),scope={accountId:'e32b564514d4f9b9e383b7dd30dbb026',gatewayId:'default',billing:'UNIFIED'};
 const manifest={version:'strong-route-comparison-v1',scope,maxOutputTokens:4096,maxPerCallUsd:.125,maxParallel:1,packets:f.packets};
 const path=root+'/manifest.json';if(existsSync(path))expect(load(path)).toEqual(manifest);else durable(path,manifest);
 const pending=f.packets.filter(p=>!cached.some(r=>r.requestHash===p.requestHash&&r.model===p.model));
 const priorPath='.local-reports/cloudflare-comparison/phase-a-results.json',prior=existsSync(priorPath)?load(priorPath).rows:[];
 const priorReserved=prior.reduce((n:number,r:any)=>n+r.reservedUsd,0),priorCalls=prior.reduce((n:number,r:any)=>n+r.providerCalls,0);
 expect(priorCalls+pending.length).toBeLessThanOrEqual(24);expect(priorReserved+pending.reduce((n,p)=>n+p.admission.reservationCostUsd,0)).toBeLessThanOrEqual(3);
 let access:any;const accessPath=root+'/refreshed-access.json';if(existsSync(accessPath))access=load(accessPath);
 const grantPath='.local-reports/cloudflare-comparison/phase-a-grant.json',oldGrant=existsSync(grantPath)?load(grantPath):undefined;
 const scopeContainsNewRequests=Boolean(oldGrant&&pending.every(p=>oldGrant.evaluationScope.operations.some((o:any)=>o.model===p.model&&o.requestHash===p.requestHash)));
 const report={mode:'MATCHED_COMPARISON_PREPARED_NOT_EXECUTED',manifestHash:evidenceHash(manifest),newPaidCalls:0,cases:f.cases.map(c=>({id:c.id,kind:c.kind,labelSource:c.labelSource,evidenceHash:evidenceHash(c.payload)})),routes:STRONG_ROUTES,plannedMeasurements:f.packets.length,exactPriorRealResultsReused:cached.length,plannedNewCalls:pending.length,plannedNewReservationUpperBoundUsd:pending.reduce((n,p)=>n+p.admission.reservationCostUsd,0),totalApprovedUsd:3,previousReservedUsd:priorReserved,previousActualCalls:priorCalls,comparison:compareStrongRoutes(cached,f.cases.map(c=>c.id),STRONG_ROUTES),cachedResults:cached.map(({result,...r})=>r),blockers:[...(access?.results?.some((r:any)=>r.status===403)?['GATEWAY_AND_BILLING_READ_FORBIDDEN']:[]),...(!scopeContainsNewRequests?['EXISTING_IMMUTABLE_GRANT_DOES_NOT_ADMIT_MATCHED_REQUESTS']:[]),...(prior.some((r:any)=>!r.settled)?['PRIOR_QWEN_DOLLAR_HOLD_STILL_OCCUPIES_APPROVED_EVALUATION_SLOT']:[])],productionQualified:false};
 const manifestHash=evidenceHash(manifest),runId=manifestHash.slice(0,20);
 durable(root+'/proposed-scope.json',{status:'PROPOSED_NOT_AUTHORIZED_OR_INSTALLED',accountId:oldGrant?.accountId,earliestNonoverlappingGrantStart:oldGrant?.validUntil,additionalExecutionSlotApprovalRequired:true,existingQwenHoldReleaseAllowed:false,evaluationScope:{feedId:'strong-comparison:'+runId,manifestHash,operations:pending.map(p=>({id:'strong-comparison:'+runId+':'+p.route+':'+p.caseId,model:p.model,requestHash:p.requestHash})),maxNewSpendingUsd:Math.ceil(pending.reduce((n,p)=>n+p.admission.reservationCostUsd,0)*1000000)/1000000,maxNewOperations:pending.length,maxConcurrentOperations:1,maxLifetimeExposureUsd:73}});
 durable(root+'/prepared-comparison.json',report);
 writeFileSync('benchmarks/strong-route-comparison-results.json',JSON.stringify(report,null,2)+'\n');
});
it.skipIf(process.env.DISTILLED_RUN_STRONG_COMPARISON!=='AUTHORIZED_MATCHED_EXISTING_3_USD_CAP')('runs only a separately admitted frozen scope, never reissues a prior operation',async()=>{
 const f=await prepareStrongComparison(),manifest=load(root+'/manifest.json');expect(f.packets).toEqual(manifest.packets);
 const manifestHash=evidenceHash(manifest),cached=reusable(f.packets),runId=manifestHash.slice(0,20),grantFile=process.env.DISTILLED_STRONG_COMPARISON_GRANT_FILE;
 if(!grantFile)throw Error('FROZEN_COMPARISON_AUTHORIZATION_REQUIRED');const grant=load(grantFile);
 if(grant.evaluationScope?.manifestHash!==manifestHash)throw Error('COMPARISON_GRANT_SCOPE_MISMATCH');
 const token=process.env.CLOUDFLARE_AI_GATEWAY_TOKEN??readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const varsFile=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!token||!varsFile)throw Error('COMPARISON_CREDENTIALS_REQUIRED');
 const vars=readFileSync(varsFile,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('OPENROUTER_KEY_REQUIRED');
 const db=evaluationD1(token) as unknown as D1Database;
 // This executor cannot create, extend or replace a grant or buy gateway credits.
 const durableGrant=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(grant.id).first<{json:string}>();if(!durableGrant||evidenceHash(JSON.parse(durableGrant.json))!==evidenceHash(grant))throw Error('DURABLE_COMPARISON_AUTHORIZATION_REQUIRED');
 const previousGrantId=JSON.parse(readFileSync('benchmarks/cloudflare-real-evaluation-results.json','utf8')).approval.phaseAGrantId;
 const prior=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) AS reserved FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=?').bind(previousGrantId).first<{n:number;reserved:number}>();
 const pending=f.packets.filter(p=>!cached.some(r=>r.requestHash===p.requestHash&&r.model===p.model));
 if(!prior||prior.n+pending.length>24||prior.reserved+pending.reduce((n,p)=>n+p.admission.reservationCostUsd,0)>3)throw Error('COMBINED_EVALUATION_APPROVAL_LIMIT');
 const rows:any[]=[...cached];
 for(const p of f.packets){
  if(cached.some(r=>r.requestHash===p.requestHash&&r.model===p.model))continue;
  const operationId='strong-comparison:'+runId+':'+p.route+':'+p.caseId;
  if(!grant.evaluationScope.operations.some((o:any)=>o.id===operationId&&o.model===p.model&&o.requestHash===p.requestHash))throw Error('FROZEN_OPERATION_NOT_AUTHORIZED');
  // Missing local artifacts never authorize buying an already-submitted question again.
  if(await db.prepare("SELECT id FROM v1_model_spending_reservations WHERE model=? AND json_extract(json,'$.evaluation.requestHash')=? LIMIT 1").bind(p.model,p.requestHash).first())throw Error('EXISTING_PAID_QUESTION_REQUIRES_SAVED_RESULT_RECOVERY');
  const prefix=root+'/'+p.route+'-'+p.caseId;if(existsSync(prefix+'-intent.json'))throw Error('PRIOR_INTENT_NO_AUTOMATIC_REISSUE');
  const reservation={id:operationId,accountId:grant.accountId,model:p.model,feedId:grant.evaluationScope.feedId,token:randomUUID(),reservedCostUsd:p.admission.reservationCostUsd,leaseUntil:Date.now()+240000,createdAt:new Date().toISOString(),evaluation:{manifestHash,requestHash:p.requestHash}};
  durable(prefix+'-intent.json',{state:'PREPARED',reservation});await reserveModelSpending(db,reservation);durable(prefix+'-intent.json',{state:'ADMITTED',reservation});
  let calls=0,usage:any,result:any,validation:any,errorCode:string|undefined;const receipts:any[]=[];
  const env:any={CLOUDFLARE_ACCOUNT_ID:manifest.scope.accountId,CLOUDFLARE_AI_GATEWAY_ID:manifest.scope.gatewayId,CLOUDFLARE_AI_GATEWAY_TOKEN:token,OPENROUTER_API_KEY:key};
  const fetcher:typeof fetch=async(url,init)=>{const expected=p.route==='cloudflare'?'https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId+'/ai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';if(String(url)!==expected||++calls!==1||evidenceHash(JSON.parse(String(init?.body)))!==p.requestHash)throw Error('FROZEN_REQUEST_CHANGED');return fetch(url,init)};
  env.AI={run:async(model:string,input:any)=>{if(++calls!==1||evidenceHash({model,input})!==p.requestHash)throw Error('FROZEN_REQUEST_CHANGED');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId+'/ai/run/'+model,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});const raw=await r.text();durable(prefix+'-native.json',{status:r.status,raw});const envelope=JSON.parse(raw);if(!r.ok||!envelope.success)throw Error('NATIVE_REQUEST_FAILED');return envelope.result}};
  const route={task:'construction' as const,provider:p.route,model:p.model.replace(/^(cloudflare|workers_ai):/,''),identity:p.model},start=performance.now();
  try{result=await withProviderReceiptSink(async r=>{receipts.push(r);durable(prefix+'-receipts.json',receipts)},()=>boundedCompletion({...modelOptionsForRoute(env,route,fetcher),timeoutMs:180000,usageRecorder:async u=>{usage=u}},reservation.feedId,'event_review',p.kind==='CONSTRUCTION'?'SEMANTIC_CONSTRUCTION':'GROUNDING',JSON.stringify(p.payload),p.schema,{maxOutputTokens:4096,signal:AbortSignal.timeout(180000),uniqueJsonKeys:true}));validation=f.cases.find(c=>c.id===p.caseId)!.validate(result)}catch(e){errorCode=e instanceof Error?e.message:'UNKNOWN'}
  const proof=receipts.find(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd!==undefined),confirmed=Boolean(proof&&usage?.reportedCostUsd===proof.reportedCostUsd);
  const row={route:p.route,caseId:p.caseId,model:p.model,requestHash:p.requestHash,wallMs:performance.now()-start,providerCalls:calls,usage,receipts,result,validation,errorCode,qualityReview:'PENDING',settled:false,reservedUsd:reservation.reservedCostUsd};durable(prefix+'-result.json',row);
  if(confirmed){await settleModelSpending(db,reservation.id,reservation.token,{costUsd:usage.reportedCostUsd,reported:true});row.settled=true;durable(prefix+'-result.json',row)}rows.push({...row,...(confirmed?{costUsd:usage.reportedCostUsd}:{})});
  const stopReason=!confirmed?'UNCONFIRMED_ACCOUNTING':errorCode?'MODEL_FAILURE':!validation?.valid?'QUALITY_FAILURE':null;
  durable(root+'/live-results.json',{manifestHash,rows,stopReason,comparison:compareStrongRoutes(rows as ComparisonRow[],f.cases.map(c=>c.id),STRONG_ROUTES),productionQualified:false});if(stopReason)return;
 }
});
