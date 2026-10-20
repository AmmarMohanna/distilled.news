import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {prepareStrongComparison,prepareGpt41Scope,assertCloudflareComparisonReady,evidenceHash,compareStrongRoutes,STRONG_ROUTES,type ComparisonRow} from './strong-route-comparison';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending} from '../apps/worker/src/v1-intelligence/model-spending';
import {boundedCompletion} from '../apps/worker/src/ai';
import {modelOptionsForRoute} from '../apps/worker/src/v1-intelligence/provider-routing';
import {withProviderReceiptSink} from '../apps/worker/src/provider-receipt';
import {validateCloudflareLog} from '../apps/worker/src/cloudflare-log';
import {confirmedEvaluationCharge} from './cloudflare-evaluation-billing';
const root='.local-reports/cloudflare-gpt41';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
async function readCloudflareChargeOnce(prefix:string,token:string,priorRows:any[],reservationUsd:number,deadline:number){
 const saved=load(prefix+'-response.json'),payload=JSON.parse(saved.raw),logId=saved.headers['cf-aig-log-id'],base='https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026';
 const get=async(path:string)=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('BILLING_OBSERVATION_DEADLINE');const r=await fetch(base+path,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(Math.min(15000,remaining))});if(!r.ok)throw Error('BILLING_READ_UNAVAILABLE');const body=await r.json() as any;if(body.success!==true)throw Error('BILLING_READ_UNAVAILABLE');return body};
 const log=await get('/ai-gateway/gateways/default/logs/'+logId),route=validateCloudflareLog(log.result,logId,'cloudflare:openai/gpt-4.1',payload);
 const start=Math.floor(Date.parse(log.result.created_at)/3600000)*3600000,end=start+3600000;
 const billing=await get('/ai-gateway/billing/usage-history?value_grouping_window=hour&start_time='+start+'&end_time='+end),inventory=await get('/ai-gateway/gateways/default/logs?page=1&per_page=50'),terminal=await get('/ai-gateway/gateways/default/logs?page=2&per_page=50'),gateways=await get('/ai-gateway/gateways');
 if(billing.result.history.some((h:any)=>h.start_time*1000!==start||h.end_time*1000!==end))throw Error('BILLING_WINDOW_UNBOUND');
 const prior=priorRows.filter(r=>r.route==='cloudflare').map(r=>{if(!r.settled||!r.gatewayLogId)throw Error('PRIOR_CLOUDFLARE_CHARGE_UNCONFIRMED');const retained=inventory.result.find((l:any)=>l.id===r.gatewayLogId),bucketStartMs=Math.floor(Date.parse(retained?.created_at)/3600000)*3600000;return {id:r.gatewayLogId,costUsd:r.costUsd,bucketStartMs}});
 const proof={billing,inventory,inventoryComplete:Array.isArray(terminal.result)&&terminal.result.length===0,gatewayIds:gateways.result.map((g:any)=>g.id),current:{id:logId,estimatedCostUsd:route.estimatedCostUsd!,reservationUsd,bucketStartMs:start},prior};durable(prefix+'-billing-observation.json',proof);const costUsd=confirmedEvaluationCharge(proof);
 durable(prefix+'-billing-proof.json',{at:new Date().toISOString(),...proof,costUsd,log,source:'ACTUAL_BILLING_DELTA_WITH_EXACT_COMPLETE_GATEWAY_INVENTORY'});return {costUsd,gatewayLogId:logId};
}
async function confirmCloudflareCharge(prefix:string,token:string,priorRows:any[],reservationUsd:number){
 const deadline=Date.now()+240000;for(let attempt=0;;attempt++){if(Date.now()>=deadline)throw Error('BILLING_OBSERVATION_DEADLINE');try{return await readCloudflareChargeOnce(prefix,token,priorRows,reservationUsd,deadline)}catch(e){if(!(e instanceof Error)||e.message!=='BILLING_DELTA_UNCONFIRMED'||attempt>=16||Date.now()+15000>=deadline)throw e;await new Promise(resolve=>setTimeout(resolve,15000))}}
}
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
 const ledgerPath=root+'/current-ledger-preflight.json';if(existsSync(ledgerPath)){
  const ledger=load(ledgerPath),selected=prepareGpt41Scope(f.packets,cached,{calls:ledger.priorEvaluation.calls,reservedUsd:ledger.priorEvaluation.reservedUsd,heldSlots:ledger.liabilities.heldSlots,lifetimeExposureUsd:ledger.lifetime.exposureUsd});
  const grantId='gpt41-comparison:'+runId,installedGrant=existsSync(root+'/gpt41-grant.json')?load(root+'/gpt41-grant.json'):undefined;
  const validFrom=ledger.grants.filter((g:any)=>g.id!==grantId).reduce((latest:string,g:any)=>g.valid_until>latest?g.valid_until:latest,new Date().toISOString());
  const proposedGrant={id:grantId,accountId:oldGrant.accountId,modelIds:[...new Set(selected.operations.map(p=>p.model))],validFrom,validUntil:new Date(Date.parse(validFrom)+4*3600000).toISOString(),maxExposureUsd:73,maxConcurrentOperations:selected.maxConcurrentOperations,evaluationScope:{feedId:'strong-comparison:'+runId,manifestHash,operations:selected.operations.map(p=>({id:'strong-comparison:'+runId+':'+p.route+':'+p.caseId,model:p.model,requestHash:p.requestHash})),maxNewSpendingUsd:selected.maxNewSpendingUsd,maxNewOperations:selected.operations.length,maxConcurrentOperations:1,maxLifetimeExposureUsd:73}};
  durable(root+'/gpt41-grant-proposal.json',{status:installedGrant?'ALREADY_INSTALLED_UNCHANGED':'USER_REQUESTED_NOT_INSTALLED',approval:'User requested arranging and running GPT-4.1 comparison within existing $3 budget while preserving unresolved hold',ledgerSnapshotAt:ledger.at,originalCeilingUsd:73,unresolvedLiabilitiesPreserved:ledger.liabilities,grant:installedGrant??proposedGrant});
  if(installedGrant)expect(evidenceHash(load(root+'/gpt41-grant-proposal.json').grant)).toBe(evidenceHash(installedGrant));
 }
 durable(root+'/prepared-comparison.json',report);
 const accessNow=root+'/narrow-access.json',installed=root+'/gpt41-scope-installation.json';if(existsSync(accessNow)){
  const access=load(accessNow),gateways=access.results.find((r:any)=>r.path.endsWith('/gateways')),credits=access.results.find((r:any)=>r.path.endsWith('/credit-balance')),installation=existsSync(installed)?load(installed):undefined;
  Object.assign(report,{mode:'GPT41_TWO_ROUTE_COMPARISON_BLOCKED_BEFORE_INFERENCE',currentGpt41Comparison:{routes:['cloudflare','openrouter'],newCalls:11,newReservationUpperBoundUsd:.542196,accessCheckedAt:access.at,gatewayReadStatus:gateways?.status,gatewayCount:gateways?.result?.length,creditReadStatus:credits?.status,creditBalance:credits?.result?.balance,scopeInstallation:installation},comparison:compareStrongRoutes(cached.filter(r=>r.route!=='workers_ai'),f.cases.map(c=>c.id),['cloudflare','openrouter']),blockers:[...(gateways?.status===200&&gateways.result.length===0?['CONFIGURED_GATEWAY_DOES_NOT_EXIST']:[]),...(credits?.status!==200||!(credits.result.balance>0)?['PREPAID_CREDITS_UNAVAILABLE']:[]),...(!installation?['GPT41_SCOPE_NOT_INSTALLED']:Date.parse(installation.validFrom)>Date.now()?['PRIOR_IMMUTABLE_GRANT_WINDOW_STILL_ACTIVE']:[])]});
 }
 durable(root+'/prepared-report.json',report);
});
it.skipIf(process.env.DISTILLED_INSTALL_GPT41_SCOPE!=='USER_REQUESTED_EXISTING_3_USD_PRESERVE_HOLDS')('installs only the separately requested GPT-4.1 scope without changing historical grants or liabilities',async()=>{
 const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(token) as unknown as D1Database;
 const proposal=load(root+'/gpt41-grant-proposal.json'),grant=proposal.grant,f=await prepareStrongComparison(),manifest=load(root+'/manifest.json');
 if(proposal.status!=='USER_REQUESTED_NOT_INSTALLED'||grant.evaluationScope.manifestHash!==evidenceHash(manifest))throw Error('EXPLICIT_FROZEN_SCOPE_REQUIRED');
 const historical=await db.prepare('SELECT id,json FROM v1_model_spending_authorizations WHERE account_id=? AND id<>? ORDER BY id').bind(grant.accountId,grant.id).all();
 const holds=()=>db.prepare('SELECT r.id,r.json,s.cost_usd,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? AND COALESCE(s.reported,0)=0 ORDER BY r.id').bind(grant.accountId).all();
 const before=await holds();if(before.results.length!==grant.maxConcurrentOperations-1)throw Error('LIABILITY_STATE_CHANGED');
 const previous=load('.local-reports/cloudflare-comparison/phase-a-grant.json');
 const prior=await db.prepare('SELECT COUNT(*) AS calls,COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) AS reservedUsd FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=?').bind(previous.id).first<{calls:number;reservedUsd:number}>();
 const lifetime=await db.prepare('SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) AS usd FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=?').bind(grant.accountId).first<{usd:number}>();
 const scope=prepareGpt41Scope(f.packets,reusable(f.packets),{...prior!,heldSlots:before.results.length,lifetimeExposureUsd:lifetime!.usd});
 expect(grant.evaluationScope.operations).toEqual(scope.operations.map(p=>({id:'strong-comparison:'+evidenceHash(manifest).slice(0,20)+':'+p.route+':'+p.caseId,model:p.model,requestHash:p.requestHash})));
 expect(grant.evaluationScope.maxNewSpendingUsd).toBe(scope.maxNewSpendingUsd);expect(grant.maxExposureUsd).toBe(73);expect(grant.evaluationScope.maxConcurrentOperations).toBe(1);
 await authorizeModelSpending(db,grant);
 expect((await db.prepare('SELECT id,json FROM v1_model_spending_authorizations WHERE account_id=? AND id<>? ORDER BY id').bind(grant.accountId,grant.id).all()).results).toEqual(historical.results);expect((await holds()).results).toEqual(before.results);
 durable(root+'/gpt41-grant.json',grant);durable(root+'/gpt41-scope-installation.json',{at:new Date().toISOString(),grantId:grant.id,priorGrantsUnchanged:true,unresolvedHoldsUnchanged:true,newPaidCalls:0,validFrom:grant.validFrom,newCallLimit:scope.operations.length,newReservationCapUsd:scope.maxNewSpendingUsd,accountCeilingUsd:73});
});
it.skipIf(process.env.DISTILLED_INSTALL_REMAINING_SCOPE!=='USER_AUTHORIZED_REMAINING_6_WITHIN_3')('installs the explicitly authorized six-call successor without editing old grants or liabilities',async()=>{
 const proposal=load(root+'/gpt41-remaining-proposal.json'),grant=proposal.grant,old=load(root+'/gpt41-grant.json'),phaseA=load('.local-reports/cloudflare-comparison/phase-a-grant.json'),manifest=load(root+'/manifest.json');
 if(proposal.status!=='PREPARED_REQUIRES_EXPLICIT_SUCCESSOR_AUTHORIZATION'||grant.maxExposureUsd!==73||grant.evaluationScope.maxNewOperations!==6||grant.evaluationScope.maxNewSpendingUsd!==.289629||grant.evaluationScope.maxConcurrentOperations!==1||grant.evaluationScope.manifestHash!==evidenceHash(manifest))throw Error('SUCCESSOR_SCOPE_MISMATCH');
 const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(token) as unknown as D1Database;
 const historical=await db.prepare('SELECT id,json FROM v1_model_spending_authorizations WHERE account_id=? AND id<>? ORDER BY id').bind(grant.accountId,grant.id).all();
 const holds=()=>db.prepare('SELECT r.id,r.json,s.cost_usd,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? AND COALESCE(s.reported,0)=0 ORDER BY r.id').bind(grant.accountId).all();const before=await holds();expect(before.results.length+1).toBe(grant.maxConcurrentOperations);
 const previous=await db.prepare('SELECT r.id,MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) AS exposure FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id IN (?,?)').bind(old.id,phaseA.id).all<{id:string;exposure:number}>();
 const next=old.evaluationScope.operations.filter((o:any)=>!previous.results.some(r=>r.id===o.id));expect(grant.evaluationScope.operations).toEqual(next);expect(previous.results.length+next.length).toBeLessThanOrEqual(24);expect(previous.results.reduce((n,r)=>n+r.exposure,0)+grant.evaluationScope.maxNewSpendingUsd).toBeLessThanOrEqual(3);
 const cap=next.reduce((n:number,o:any)=>n+manifest.packets.find((p:any)=>p.model===o.model&&p.requestHash===o.requestHash).admission.reservationCostUsd,0);expect(Math.ceil(cap*1e6)/1e6).toBe(grant.evaluationScope.maxNewSpendingUsd);
 await authorizeModelSpending(db,grant);
 expect((await holds()).results).toEqual(before.results);expect((await db.prepare('SELECT id,json FROM v1_model_spending_authorizations WHERE account_id=? AND id<>? ORDER BY id').bind(grant.accountId,grant.id).all()).results).toEqual(historical.results);
 durable(root+'/gpt41-remaining-grant.json',grant);durable(root+'/gpt41-remaining-installation.json',{at:new Date().toISOString(),grantId:grant.id,calls:6,reservationCapUsd:.289629,oldGrantsUnchanged:true,oldHoldsUnchanged:true,newPaidCalls:0});
});
it.skipIf(process.env.DISTILLED_REPLAY_SAVED_CLOUDFLARE!=='READ_ONLY_NO_INFERENCE')('validates the exact saved Cloudflare completion without reissuing inference or releasing financial holds',async()=>{
 const caseId=process.env.DISTILLED_SAVED_CLOUDFLARE_CASE??'SHORT_T01',prefix=root+'/cloudflare-'+caseId,f=await prepareStrongComparison(),p=f.packets.find(p=>p.route==='cloudflare'&&p.caseId===caseId)!;if(!p)throw Error('UNFROZEN_SAVED_CASE');const saved=load(prefix+'-response.json'),log=existsSync(prefix+'-bound-log.json')?JSON.parse(load(prefix+'-bound-log.json').raw):load(root+'/bound-log.json'),original=load(prefix+'-result.json');let inferenceCalls=0,usage:any;const receipts:any[]=[];
 const env:any={CLOUDFLARE_ACCOUNT_ID:'e32b564514d4f9b9e383b7dd30dbb026',CLOUDFLARE_AI_GATEWAY_ID:'default',CLOUDFLARE_AI_GATEWAY_TOKEN:'OFFLINE_SAVED_RESPONSE'};
 const fetcher:typeof fetch=async(url,init)=>{if(init?.method==='GET'){expect(String(url)).toBe('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/ai-gateway/gateways/default/logs/'+saved.headers['cf-aig-log-id']);return Response.json(log)}expect(evidenceHash(JSON.parse(String(init?.body)))).toBe(p.requestHash);inferenceCalls++;return new Response(saved.raw,{status:saved.status,headers:Object.fromEntries(Object.entries(saved.headers).filter(([,v])=>typeof v==='string')) as Record<string,string>})};
 const route={task:'construction' as const,provider:'cloudflare' as const,model:'openai/gpt-4.1',identity:p.model};
 const result=await withProviderReceiptSink(async r=>{receipts.push(r)},()=>boundedCompletion({...modelOptionsForRoute(env,route,fetcher),usageRecorder:async u=>{usage=u}},'saved-only','event_review','SEMANTIC_CONSTRUCTION',JSON.stringify(p.payload),p.schema,{maxOutputTokens:4096,signal:new AbortController().signal,uniqueJsonKeys:true}));
 const validation=f.cases.find(c=>c.id===p.caseId)!.validate(result);expect(validation.valid).toBe(true);expect(inferenceCalls).toBe(1);expect(usage.reportedCostUsd).toBeUndefined();
 durable(prefix+'-recovered.json',{...original,result,validation,usage,receipts,errorCode:undefined,recoveredFromSavedResponse:true,settled:false,estimatedGatewayCostUsd:log.result.cost,newPaidCalls:0});
});
it.skipIf(process.env.DISTILLED_RECOVER_SAVED_CLOUDFLARE!=='ACTUAL_BILLING_NO_INFERENCE')('accounts the saved completed Cloudflare request only from actual uniquely bound billing',async()=>{
 const caseId=process.env.DISTILLED_SAVED_CLOUDFLARE_CASE??'SHORT_T01',prefix=root+'/cloudflare-'+caseId,grant=load(root+'/gpt41-grant.json'),intent=load(prefix+'-intent.json').reservation,row=load(existsSync(prefix+'-recovered.json')?prefix+'-recovered.json':prefix+'-result.json'),f=await prepareStrongComparison(),p=f.packets.find(p=>p.route==='cloudflare'&&p.caseId===caseId)!;
 if(row.requestHash!==p.requestHash||intent.evaluation.requestHash!==p.requestHash||!grant.evaluationScope.operations.some((o:any)=>o.id===intent.id&&o.model===p.model&&o.requestHash===p.requestHash))throw Error('SAVED_RECOVERY_IDENTITY_MISMATCH');
 const token=load(join(process.env.APPDATA!,'xdg.config/cloudflare/config/default.json')).oauth_token,ledgerToken=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(ledgerToken) as unknown as D1Database;
 const saved=await db.prepare('SELECT json FROM v1_model_spending_reservations WHERE id=?').bind(intent.id).first<{json:string}>();expect(JSON.parse(saved!.json)).toEqual(intent);
 const priorRows=f.packets.filter(p=>p.route==='cloudflare'&&p.caseId!==caseId&&existsSync(root+'/cloudflare-'+p.caseId+'-accounted.json')).map(p=>load(root+'/cloudflare-'+p.caseId+'-accounted.json'));
 const confirmed=await confirmCloudflareCharge(prefix,token,priorRows,intent.reservedCostUsd);
 await settleModelSpending(db,intent.id,intent.token,{costUsd:confirmed.costUsd,reported:true});
 durable(prefix+'-accounted.json',{...row,...confirmed,settled:true,usage:{...row.usage,reportedCostUsd:confirmed.costUsd},billingSource:'ACTUAL_BILLING_DELTA',errorCode:row.errorCode==='BILLING_DELTA_UNCONFIRMED'?undefined:row.errorCode,newPaidCalls:0});
});
it.skipIf(process.env.DISTILLED_RUN_STRONG_COMPARISON!=='AUTHORIZED_MATCHED_EXISTING_3_USD_CAP')('runs only a separately admitted frozen scope, never reissues a prior operation',async()=>{
 const f=await prepareStrongComparison(),manifest=load(root+'/manifest.json');expect(f.packets).toEqual(manifest.packets);
 const manifestHash=evidenceHash(manifest),cached=reusable(f.packets),runId=manifestHash.slice(0,20),grantFile=process.env.DISTILLED_STRONG_COMPARISON_GRANT_FILE;
 if(!grantFile)throw Error('FROZEN_COMPARISON_AUTHORIZATION_REQUIRED');const grant=load(grantFile);
 if(grant.evaluationScope?.manifestHash!==manifestHash)throw Error('COMPARISON_GRANT_SCOPE_MISMATCH');
 const cloudflareAuthFile=join(process.env.APPDATA!,'xdg.config/cloudflare/config/default.json');
 const token=process.env.CLOUDFLARE_AI_GATEWAY_TOKEN??(existsSync(cloudflareAuthFile)?load(cloudflareAuthFile).oauth_token:undefined);
 const varsFile=process.env.DISTILLED_EVALUATION_VARS_FILE;if(!token||!varsFile)throw Error('COMPARISON_CREDENTIALS_REQUIRED');
 const vars=readFileSync(varsFile,'utf8'),key=vars.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(!key)throw Error('OPENROUTER_KEY_REQUIRED');
 const ledgerToken=process.env.DISTILLED_EVALUATION_LEDGER_TOKEN??readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const db=evaluationD1(ledgerToken) as unknown as D1Database;
 // This executor cannot create, extend or replace a grant or buy gateway credits.
 const durableGrant=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(grant.id).first<{json:string}>();if(!durableGrant||evidenceHash(JSON.parse(durableGrant.json))!==evidenceHash(grant))throw Error('DURABLE_COMPARISON_AUTHORIZATION_REQUIRED');
 // Only metadata GETs occur before readiness is established; no paid intent or reservation.
 const api='https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId;
 const gateway=await fetch(api+'/ai-gateway/gateways/'+manifest.scope.gatewayId,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)}),billing=await fetch(api+'/ai-gateway/billing/credit-balance',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 const gatewayBody=await gateway.json() as any,billingBody=await billing.json() as any;
 const readiness={validFrom:grant.validFrom,validUntil:grant.validUntil,gatewayStatus:gateway.status,billingStatus:billing.status,balance:billingBody.result?.balance,byokOnly:Boolean(gatewayBody.result?.byok_only)};
 durable(root+'/live-readiness.json',{at:new Date().toISOString(),...readiness});assertCloudflareComparisonReady(readiness);
 const previousGrantId=JSON.parse(readFileSync('benchmarks/cloudflare-real-evaluation-results.json','utf8')).approval.phaseAGrantId;
 const prior=await db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) AS reserved FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=?').bind(previousGrantId).first<{n:number;reserved:number}>();
 const routes=STRONG_ROUTES.filter(route=>f.packets.some(p=>p.route===route&&grant.modelIds.includes(p.model))),selectedPackets=f.packets.filter(p=>routes.includes(p.route));
 const pending=selectedPackets.filter(p=>!cached.some(r=>r.requestHash===p.requestHash&&r.model===p.model));
 if(!prior||prior.n+pending.length>24||prior.reserved+pending.reduce((n,p)=>n+p.admission.reservationCostUsd,0)>3)throw Error('COMBINED_EVALUATION_APPROVAL_LIMIT');
 const rows:any[]=cached.filter(r=>routes.includes(r.route));
 for(const p of selectedPackets){
  if(cached.some(r=>r.requestHash===p.requestHash&&r.model===p.model))continue;
  const operationId='strong-comparison:'+runId+':'+p.route+':'+p.caseId;
  const prefix=root+'/'+p.route+'-'+p.caseId;
  if(existsSync(prefix+'-accounted.json')){
   const row=load(prefix+'-accounted.json'),intent=load(prefix+'-intent.json').reservation,settlement=await db.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(operationId).first<{token:string;cost_usd:number;reported:number}>();
   if(!settlement||intent.id!==operationId||row.requestHash!==p.requestHash||row.model!==p.model||!row.settled||settlement?.token!==intent.token||settlement.reported!==1||settlement.cost_usd!==row.costUsd)throw Error('SAVED_ACCOUNTED_RESULT_MISMATCH');
   rows.push({...row,errorCode:row.errorCode==='BILLING_DELTA_UNCONFIRMED'?undefined:row.errorCode});continue;
  }
  if(!grant.evaluationScope.operations.some((o:any)=>o.id===operationId&&o.model===p.model&&o.requestHash===p.requestHash))throw Error('FROZEN_OPERATION_NOT_AUTHORIZED');
  // Missing local artifacts never authorize buying an already-submitted question again.
  if(await db.prepare("SELECT id FROM v1_model_spending_reservations WHERE model=? AND json_extract(json,'$.evaluation.requestHash')=? LIMIT 1").bind(p.model,p.requestHash).first())throw Error('EXISTING_PAID_QUESTION_REQUIRES_SAVED_RESULT_RECOVERY');
  if(existsSync(prefix+'-intent.json'))throw Error('PRIOR_INTENT_NO_AUTOMATIC_REISSUE');
  const reservation={id:operationId,accountId:grant.accountId,model:p.model,feedId:grant.evaluationScope.feedId,token:randomUUID(),reservedCostUsd:p.admission.reservationCostUsd,leaseUntil:Date.now()+240000,createdAt:new Date().toISOString(),evaluation:{manifestHash,requestHash:p.requestHash}};
  durable(prefix+'-intent.json',{state:'PREPARED',reservation});await reserveModelSpending(db,reservation);durable(prefix+'-intent.json',{state:'ADMITTED',reservation});
  let calls=0,usage:any,result:any,validation:any,errorCode:string|undefined;const receipts:any[]=[];
  const env:any={CLOUDFLARE_ACCOUNT_ID:manifest.scope.accountId,CLOUDFLARE_AI_GATEWAY_ID:manifest.scope.gatewayId,CLOUDFLARE_AI_GATEWAY_TOKEN:token,OPENROUTER_API_KEY:key};
  const fetcher:typeof fetch=async(url,init)=>{if(init?.method==='GET'){const submitted=load(prefix+'-response.json'),logId=submitted.headers['cf-aig-log-id'];if(p.route!=='cloudflare'||String(url)!=='https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId+'/ai-gateway/gateways/'+manifest.scope.gatewayId+'/logs/'+logId)throw Error('UNBOUND_RECEIPT_READ');const response=await fetch(url,init);durable(prefix+'-bound-log.json',{status:response.status,raw:await response.clone().text()});return response}if(Date.now()>=Date.parse(grant.validUntil)||Date.now()>=reservation.leaseUntil)throw Error('PAID_EXECUTION_WINDOW_EXPIRED');const expected=p.route==='cloudflare'?'https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId+'/ai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions';if(String(url)!==expected||++calls!==1||evidenceHash(JSON.parse(String(init?.body)))!==p.requestHash)throw Error('FROZEN_REQUEST_CHANGED');const response=await fetch(url,init);durable(prefix+'-response.json',{status:response.status,headers:Object.fromEntries(['cf-aig-log-id','cf-ray','x-request-id','x-generation-id'].map(k=>[k,response.headers.get(k)])),raw:await response.clone().text()});return response};
  env.AI={run:async(model:string,input:any)=>{if(++calls!==1||evidenceHash({model,input})!==p.requestHash)throw Error('FROZEN_REQUEST_CHANGED');const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+manifest.scope.accountId+'/ai/run/'+model,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(180000)});const raw=await r.text();durable(prefix+'-native.json',{status:r.status,raw});const envelope=JSON.parse(raw);if(!r.ok||!envelope.success)throw Error('NATIVE_REQUEST_FAILED');return envelope.result}};
  const route={task:'construction' as const,provider:p.route,model:p.model.replace(/^(cloudflare|workers_ai):/,''),identity:p.model},start=performance.now();
  try{result=await withProviderReceiptSink(async r=>{receipts.push(r);durable(prefix+'-receipts.json',receipts)},()=>boundedCompletion({...modelOptionsForRoute(env,route,fetcher),timeoutMs:180000,usageRecorder:async u=>{usage=u}},reservation.feedId,'event_review',p.kind==='CONSTRUCTION'?'SEMANTIC_CONSTRUCTION':'GROUNDING',JSON.stringify(p.payload),p.schema,{maxOutputTokens:4096,signal:AbortSignal.timeout(180000),uniqueJsonKeys:true}));validation=f.cases.find(c=>c.id===p.caseId)!.validate(result)}catch(e){errorCode=e instanceof Error?e.message:'UNKNOWN'}
  const wallMs=performance.now()-start;
  let billing:any;if(p.route==='cloudflare'){try{billing=await confirmCloudflareCharge(prefix,token,rows,reservation.reservedCostUsd);usage.reportedCostUsd=billing.costUsd}catch(e){errorCode??=e instanceof Error?e.message:'BILLING_UNCONFIRMED'}}
  const proof=receipts.find(r=>r.stage==='USAGE'&&r.generationId&&r.reportedCostUsd!==undefined),confirmed=Boolean(billing||proof&&usage?.reportedCostUsd===proof.reportedCostUsd);
  const row:any={route:p.route,caseId:p.caseId,model:p.model,requestHash:p.requestHash,wallMs,billingObservationMs:performance.now()-start-wallMs,endToEndAccountedMs:performance.now()-start,providerCalls:calls,usage,receipts,result,validation,errorCode,qualityReview:'PENDING',settled:false,reservedUsd:reservation.reservedCostUsd,...(billing?{costUsd:billing.costUsd,gatewayLogId:billing.gatewayLogId,billingSource:'ACTUAL_BILLING_DELTA'}:{})};durable(prefix+'-result.json',row);
  if(confirmed){await settleModelSpending(db,reservation.id,reservation.token,{costUsd:usage.reportedCostUsd,reported:true});row.settled=true;row.costUsd=usage.reportedCostUsd;durable(prefix+'-result.json',row);durable(prefix+'-accounted.json',row)}rows.push(row);
  // Evaluation cases are independent. Known/accounted quality failures are recorded, never repaired or retried.
  const stopReason=!confirmed?'UNCONFIRMED_ACCOUNTING':null;
  durable(root+'/live-results.json',{manifestHash,routes,rows,stopReason,comparison:compareStrongRoutes(rows as ComparisonRow[],f.cases.map(c=>c.id),routes),productionQualified:false});if(stopReason)return;
 }
});
