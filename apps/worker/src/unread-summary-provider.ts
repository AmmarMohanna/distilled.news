import {sha256} from '@distilled/contracts';
import {BriefingBudgetError,BriefingModelError,openAiCompatibleModel,type ModelPort,type ModelResponse} from '@distilled/briefing';
import type {Env} from './types';
import {modelSpendingAccount,ModelSpendingWait,reserveModelSpending,settleModelSpending} from './v1-intelligence/model-spending';
import {configuredProviderLimits} from './v1-intelligence/provider-routing';
import {providerResponseReceipt,providerBodyReceipt,type ProviderReceipt} from './provider-receipt';
import {modelSettlementStatement} from './v1-intelligence/model-spending';
import {modelCapability} from './v1-intelligence/model-capacity';
import {summaryTokenUpperBound,UnreadSummaryResourceWait,UnreadSummaryQuotaError,UnreadSummaryError} from './unread-summary';

/** Same provider account ledger and rate/concurrency admission as live V3.
 * Receipts survive a client disconnect; an uncertain call is never resubmitted. */
export function unreadSummaryPort(env:Env,feedId:string,readerId:string,fetcher:typeof fetch=fetch):ModelPort{
  return accountedModelPort(env,feedId,readerId,fetcher,'summary');
}

export function websiteDiscoveryModelPort(env:Env,feedId:string,sourceId:string,fetcher:typeof fetch=fetch):ModelPort{
  return accountedModelPort(env,feedId,sourceId,fetcher,'discovery');
}

function accountedModelPort(env:Env,feedId:string,scopeId:string,fetcher:typeof fetch,mode:'summary'|'discovery'):ModelPort{
  const db=env.DB;
  const discovery=mode==='discovery';
  const operation=discovery?'website-link-discovery':'unread-summary';
  const receiptKind=discovery?'website_link_discovery_provider':'unread_summary_provider';
  return {async complete(request){
    const {signal:_,...body}=request;
    const id=operation+'-provider:'+await sha256(JSON.stringify([feedId,scopeId,body]));
    const saved=await db.prepare("SELECT json FROM v1_feed_documents WHERE kind=? AND id=? AND feed_id=?").bind(receiptKind,id,feedId).first<{json:string}>();
    if(saved){
      const receipt=JSON.parse(saved.json) as {token:string;response:ModelResponse};
      await settleModelSpending(db,id,receipt.token,{costUsd:receipt.response.costUsd!,reported:true});
      return receipt.response;
    }
    if(await db.prepare('SELECT id FROM v1_model_spending_reservations WHERE id=?').bind(id).first())throw new UnreadSummaryError('SUMMARY_OUTCOME_UNKNOWN');
    const capability=modelCapability(request.model,env.V1_MODEL_CAPABILITIES_JSON);
    if(!capability)throw new BriefingBudgetError('Summary model is not configured.');
    const inputTokens=summaryTokenUpperBound(request);
    if(discovery&&(capability.transport==='DECISIONS'||request.maxTokens>capability.maxOutputTokens||
      inputTokens+request.maxTokens>capability.contextTokens))throw new BriefingBudgetError('Discovery request exceeds model capacity.');
    const estimate=inputTokens*capability.inputUsdPerToken+request.maxTokens*capability.outputUsdPerToken;
    if(discovery&&(!Number.isFinite(estimate)||estimate>0.01))throw new BriefingBudgetError('Discovery estimate exceeds its per-call limit.');
    // One atomic indexed statement serializes admission across requests/feeds.
    // Cache/receipt reuse and UNKNOWN operations above never consume this quota.
    const now = Date.now(), at = new Date(now).toISOString();
    const quota = await db.prepare(`INSERT INTO auth_attempts(id,key,action,created_at)
      SELECT ?,?,?,? WHERE
      (SELECT COUNT(*) FROM auth_attempts WHERE key=? AND action=? AND created_at>=?) < ?`)
      .bind(crypto.randomUUID(),scopeId,operation,at,scopeId,operation,new Date(now-3_600_000).toISOString(),discovery?2:6).run();
    if(quota.meta.changes!==1)throw new UnreadSummaryQuotaError();
    const token=crypto.randomUUID();

    try{
      const accountId=await modelSpendingAccount(db,request.model,at);
      await reserveModelSpending(db,{id,accountId,feedId,model:request.model,token,reservedCostUsd:estimate,createdAt:at,leaseUntil:Date.now()+120_000,providerLimits:configuredProviderLimits(env,'openrouter','interactive')});
    }catch(error){
      if(error instanceof ModelSpendingWait&&error.reason==='PROVIDER_RESOURCE_WAIT')throw new UnreadSummaryResourceWait();
      console.warn(discovery?'website-link-discovery-admission-failed':'unread-summary-admission-failed',{reason:error instanceof ModelSpendingWait?error.reason:'DATABASE_OR_CONFIGURATION_FAILURE'});
      throw new BriefingBudgetError('Summaries are temporarily unavailable. Try again shortly.');
    }
    let header:ProviderReceipt|undefined;
    const capture=async(receipt:ProviderReceipt)=>{
      const record={...receipt,id:JSON.stringify([id,receipt.stage]),reservationId:id,feedId,createdAt:new Date().toISOString()};
      const statements=[db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'model_provider_receipts',?,?,? WHERE EXISTS(SELECT 1 FROM v1_model_spending_reservations WHERE id=? AND token=? AND feed_id=?) ON CONFLICT(kind,id) DO NOTHING").bind(record.id,feedId,JSON.stringify(record),id,token,feedId)];
      if(receipt.stage==='USAGE'&&receipt.reportedCostUsd!==undefined)statements.push(modelSettlementStatement(db,id,token,{costUsd:receipt.reportedCostUsd,reported:true}));
      await db.batch(statements);
    };
    const raw=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:env.OPENROUTER_API_KEY!,reportCost:true,retries:0,timeoutMs:discovery?8_000:25_000,prices:{},fetcher,
      onResponseHeaders:async response=>{header=providerResponseReceipt(response,'OPENROUTER',request.model);await capture(header)},
      onResponseBody:async payload=>{
        const body=payload as {id?:unknown;usage?:{cost?:unknown};choices?:{finish_reason?:string}[]}|null;
        const receipt=providerBodyReceipt(header!,body?.id);
        if(receipt.generationId)await capture({...receipt,stage:'GENERATION'});
        const cost=body?.usage?.cost;
        if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0)await capture({...receipt,stage:'USAGE',reportedCostUsd:cost,finishReason:body?.choices?.[0]?.finish_reason});
      }
    });
    let response:ModelResponse;
    try{response=await raw.complete(request);}
    catch(error){
      if(error instanceof BriefingModelError&&!error.uncertain)await settleModelSpending(db,id,token,{costUsd:0,reported:true});
      throw error;
    }
    if(!Number.isFinite(response.costUsd)||response.costUsd!<0)throw Error('Summary usage could not be confirmed.');
    await db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(receiptKind,id,feedId,JSON.stringify({token,response,createdAt:at})).run();
    await settleModelSpending(db,id,token,{costUsd:response.costUsd!,reported:true});
    return response;
  }};
}
