import {sha256} from '@distilled/contracts';
import type {Env} from './types';
import {modelSpendingAccount,reserveModelSpending,settleModelSpending,ModelSpendingWait,type ModelSpendingReservation} from './v1-intelligence/model-spending';
import {modelCapability} from './v1-intelligence/model-capacity';
/** Isolated campaign assessment uses the existing account ledger. No normal
 * deployment behavior changes; this is the existing model request, not a stage.
 * A retained reservation without its response is uncertain and is never resent. */
export function campaignAssessmentFetcher(env:Env,ownerId:string|undefined,fetcher:typeof fetch):typeof fetch{
 if(env.ENVIRONMENT!=='staging'||env.AGENTOPS_CAMPAIGN_ENABLED!=='true'||env.AGENTOPS_CAMPAIGN_ISOLATED!=='true')return fetcher;
 return (async(url:RequestInfo|URL,init?:RequestInit)=>{
  if(String(url)!=='https://openrouter.ai/api/v1/chat/completions'||!ownerId||!env.RAW_ARCHIVE||typeof init?.body!=='string')throw Error('CAMPAIGN_ASSESSMENT_SCOPE');
  const request=JSON.parse(init.body),capability=modelCapability(request.model,env.V1_MODEL_CAPABILITIES_JSON);
  if(!capability||!Number.isSafeInteger(request.max_tokens)||request.max_tokens<1||request.max_tokens>capability.maxOutputTokens)throw Error('CAMPAIGN_ASSESSMENT_CAPABILITY');
  const now=new Date().toISOString(),accountId=await modelSpendingAccount(env.DB,request.model,now);
  const id='source-assessment:'+await sha256(JSON.stringify([accountId,ownerId,request])),key='agentops/campaign-assessment/'+await sha256(id)+'.json',feedId='assessment:'+ownerId;
  const prior=await env.DB.prepare('SELECT json FROM v1_model_spending_reservations WHERE id=?').bind(id).first<{json:string}>();
  if(prior){const saved=await env.RAW_ARCHIVE.get(key);if(!saved)throw new ModelSpendingWait('UNCERTAIN_ASSESSMENT_NO_RESEND');const receipt=await saved.json<{requestHash:string;status:number;body:string;costUsd:number}>();if(receipt.requestHash!==await sha256(init.body)||!Number.isFinite(receipt.costUsd)||receipt.costUsd<0)throw Error('ASSESSMENT_RECEIPT_INVALID');const reservation=JSON.parse(prior.json);await settleModelSpending(env.DB,id,reservation.token,{costUsd:receipt.costUsd,reported:true});return new Response(receipt.body,{status:receipt.status,headers:{'content-type':'application/json'}})}
  const reservation:ModelSpendingReservation={id,accountId,model:request.model,feedId,token:crypto.randomUUID(),reservedCostUsd:new TextEncoder().encode(init.body).length*capability.inputUsdPerToken+request.max_tokens*capability.outputUsdPerToken,createdAt:now,leaseUntil:Date.now()+120000,providerLimits:{provider:'openrouter',maxConcurrent:3,requestsPerMinute:60}};
  await reserveModelSpending(env.DB,reservation);
  // No retry: a failed/aborted request keeps its full hold for reconciliation.
  const response=await fetcher(url,init),text=await response.text();if(new TextEncoder().encode(text).length>16384)throw Error('ASSESSMENT_RECEIPT_TOO_LARGE');const payload=JSON.parse(text),cost=payload.usage?.cost;
  if(!Number.isFinite(cost)||cost<0||!payload.id)throw new ModelSpendingWait('UNCERTAIN_ASSESSMENT_USAGE');
  await env.RAW_ARCHIVE.put(key,JSON.stringify({requestHash:await sha256(init.body),status:response.status,body:text,costUsd:cost}),{httpMetadata:{contentType:'application/json'}});
  await settleModelSpending(env.DB,id,reservation.token,{costUsd:cost,reported:true});
  return new Response(text,{status:response.status,headers:{'content-type':'application/json'}});
 }) as typeof fetch;
}
