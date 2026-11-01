/** Exact approved eight-call quality trial; normal application financial admission. */
import {readFileSync,writeFileSync,appendFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {qualityD1} from './ledger.mjs';
import {authorizeModelSpending,reserveModelSpending,settleModelSpending,type ModelSpendingAuthorization} from '../../apps/worker/src/v1-intelligence/model-spending';
import {admitModelOperation,modelCapability} from '../../apps/worker/src/v1-intelligence/model-capacity';
import {openAiCompatibleModel} from '../../packages/briefing/src/model';
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=root+'.local-reports/leb-quality-latest/';
const load=(name:string)=>JSON.parse(readFileSync(dir+name,'utf8'));
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function save(name:string,value:unknown){const p=dir+name;writeFileSync(p,JSON.stringify(value,null,2)+'\n');const fd=openSync(p,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
const journal=(value:unknown)=>appendFileSync(dir+'execution.jsonl',JSON.stringify({at:new Date().toISOString(),...value as object})+'\n');
const plan=load('quality-focus-plan.private.json'),manifestHash=hash(plan.requests),accountId='quality-focus-'+manifestHash.slice(0,20),feedId=accountId;
const approvalName='quality-focus-approval.json';
if(!existsSync(dir+approvalName))throw Error('EXPLICIT_APPROVAL_FILE_REQUIRED');
const approval=load(approvalName);assert.equal(approval.authorization,'USER_APPROVED_8_CALLS_065_TWO_HOURS');assert.equal(approval.manifestHash,manifestHash);assert.equal(approval.maxCalls,8);assert.equal(approval.maxExposureUsd,.65);
function checkApproval(){assert.ok(Date.now()>=Date.parse(approval.validFrom)&&Date.now()<Date.parse(approval.validUntil),'AUTHORIZATION_EXPIRED');assert.ok(plan.maximumReservedUsd<=.65);assert.equal(plan.requests.length,8)}
checkApproval();
const cf=readFileSync(join(process.env.APPDATA!,'xdg.config','.wrangler','config','default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(cf,'CLOUDFLARE_AUTH_REQUIRED');
const db=qualityD1(cf) as unknown as D1Database;
const keyFile=readFileSync(process.env.QUALITY_OPENROUTER_KEY_FILE??root+'../../apps/worker/.dev.vars.staging','utf8');
const key=keyFile.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^(["'])(.*)\1$/,'$2');assert.ok(key,'PROVIDER_KEY_REQUIRED');
const grant:ModelSpendingAuthorization={id:accountId,accountId,modelIds:['openai/gpt-4.1'],validFrom:approval.validFrom,validUntil:approval.validUntil,maxExposureUsd:.65,maxConcurrentOperations:1,evaluationScope:{feedId,manifestHash,operations:plan.requests.map((r:any)=>({id:accountId+':'+r.id,model:r.request.model,requestHash:r.requestHash})),maxNewSpendingUsd:.65,maxNewOperations:8,maxConcurrentOperations:1,maxLifetimeExposureUsd:73,maxPerOperationUsd:.35,workflow:{id:manifestHash,maxNewOperations:8,maxNewSpendingUsd:.65}}};
async function preflight(){
 const tracking=await db.prepare('SELECT key FROM settings WHERE key=?').bind('model-spending:tracking-only:'+accountId).first();assert.equal(tracking,null,'TRACK_ONLY_NOT_ALLOWED');
 const trigger=await db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first<any>();assert.ok(trigger?.sql.includes('maxPerOperationUsd'),'EXACT_SCOPE_GUARD_REQUIRED');
 const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,'PROVIDER_AUTH_NOT_VALID');const j=await r.json() as any;if(j.data?.limit_remaining!=null)assert.ok(j.data.limit_remaining>=.65,'PROVIDER_KEY_BUDGET_INSUFFICIENT');
 save('quality-focus-preflight.json',{at:new Date().toISOString(),accountId,grant,isolatedDatabase:'5ca750ba-dad8-413f-896e-bd62b1023ac2',trackingOnly:false,scopeGuardVerified:true,providerAuthenticated:true,paidCalls:0});
}
async function execute(){
 await preflight();checkApproval();
 await authorizeModelSpending(db,grant);save('quality-focus-grant.json',grant);
 for(const row of plan.requests){
  checkApproval();assert.equal(hash(row.request),row.requestHash,'FROZEN_REQUEST_DRIFT');
  const id=accountId+':'+row.id,resultName=row.id+'-result.private.json',responseName=row.id+'-response.private.json',intentName=row.id+'-intent.private.json';
  const prior=await db.prepare('SELECT r.id,s.reported,s.cost_usd FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.id=?').bind(id).first<any>();
  if(prior){if(prior.reported===1&&existsSync(dir+resultName)){journal({event:'REUSED_SETTLED',id});continue}throw Error('EXISTING_OPERATION_REQUIRES_RECONCILIATION_NO_RESEND')}
  const admission=admitModelOperation(row.request.model,row.request,{type:'object',properties:{},required:[],additionalProperties:false},modelCapability(row.request.model),row.request.maxTokens);assert.ok(admission.fits);assert.equal(admission.reservationCostUsd,row.reservedUsd);
  const reservation={id,accountId,model:row.request.model,feedId,token:randomUUID(),reservedCostUsd:row.reservedUsd,leaseUntil:Date.now()+180000,createdAt:new Date().toISOString(),evaluation:{manifestHash,requestHash:row.requestHash},providerLimits:{provider:'openrouter' as const,maxConcurrent:1,requestsPerMinute:20}};
  save(intentName,{state:'PREPARED',reservation,request:row.request});await reserveModelSpending(db,reservation);save(intentName,{state:'ADMITTED',reservation,request:row.request});
  // No retry: thrown transport/unknown billing stops execution, preserving hold.
  const port=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:key!,retries:0,reportCost:true,prices:{},timeoutMs:90000,fetcher:async(url,init)=>{
   checkApproval();journal({event:'PROVIDER_REQUEST_STARTED',id,requestHash:row.requestHash});
   const r=await fetch(url,init),raw=await r.text();save(responseName,{at:new Date().toISOString(),id,status:r.status,raw});return new Response(raw,{status:r.status,headers:r.headers});
  }});
  const started=Date.now();const response=await port.complete(row.request);const wallMs=Date.now()-started;
  const envelope=load(responseName),raw=JSON.parse(envelope.raw);assert.ok(Number.isFinite(raw.usage?.cost)&&raw.usage.cost>=0&&raw.usage.cost<=reservation.reservedCostUsd,'PROVIDER_CHARGE_NOT_CONCLUSIVELY_BOUNDED');assert.ok(typeof raw.id==='string'&&raw.id.length>0,'GENERATION_ID_REQUIRED');
  save(resultName,{id,rowId:row.id,requestHash:row.requestHash,response,generationId:raw.id,wallMs,settled:false});
  await settleModelSpending(db,id,reservation.token,{costUsd:raw.usage.cost,reported:true});
  save(resultName,{id,rowId:row.id,requestHash:row.requestHash,response,generationId:raw.id,wallMs,settled:true});journal({event:'SETTLED',id,costUsd:raw.usage.cost,wallMs});
 }
 const ledger=(await db.prepare('SELECT r.id,r.reserved_cost_usd AS reservedUsd,s.cost_usd AS actualUsd,s.reported FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? ORDER BY r.id').bind(accountId).all<any>()).results;
 assert.equal(ledger.length,8);assert.ok(ledger.every(r=>r.reported===1));assert.ok(ledger.reduce((s,r)=>s+r.actualUsd,0)<=.65);
 save('quality-focus-ledger.json',{at:new Date().toISOString(),accountId,rows:ledger,calls:ledger.length,actualUsd:ledger.reduce((s,r)=>s+r.actualUsd,0),heldUsd:0});
 console.log(JSON.stringify({status:'EIGHT_CALLS_SETTLED',calls:8,actualUsd:ledger.reduce((s,r)=>s+r.actualUsd,0),heldUsd:0}));
}
try{if(process.argv[2]==='preflight'){await preflight();console.log('PREFLIGHT_PASSED_NO_PAID_CALLS')}else if(process.argv[2]==='execute')await execute();else throw Error('EXPLICIT_MODE_REQUIRED')}catch(e){journal({event:'STOP',error:e instanceof Error?e.message:'UNKNOWN'});console.error(e instanceof Error?e.message:'UNKNOWN');process.exitCode=1}
