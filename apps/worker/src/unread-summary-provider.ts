import {sha256} from '@distilled/contracts';
import {BriefingBudgetError,BriefingModelError,openAiCompatibleModel,type ModelPort,type ModelResponse} from '@distilled/briefing';
import type {Env} from './types';
import {modelSpendingAccount,ModelSpendingWait,reserveModelSpending,settleModelSpending} from './v1-intelligence/model-spending';
import {configuredProviderLimits} from './v1-intelligence/provider-routing';
import {modelCapability} from './v1-intelligence/model-capacity';
import {summaryTokenUpperBound,UnreadSummaryResourceWait,UnreadSummaryError} from './unread-summary';

/** Same provider account ledger and rate/concurrency admission as live V3.
 * Receipts survive a client disconnect; an uncertain call is never resubmitted. */
export function unreadSummaryPort(env:Env,feedId:string,readerId:string,fetcher:typeof fetch=fetch):ModelPort{
  const db=env.DB;
  const raw=openAiCompatibleModel({url:'https://openrouter.ai/api/v1/chat/completions',apiKey:env.OPENROUTER_API_KEY!,reportCost:true,retries:0,timeoutMs:25_000,prices:{},fetcher});
  return {async complete(request){
    const {signal:_,...body}=request;
    const id='unread-summary-provider:'+await sha256(JSON.stringify([feedId,readerId,body]));
    const saved=await db.prepare("SELECT json FROM v1_feed_documents WHERE kind='unread_summary_provider' AND id=? AND feed_id=?").bind(id,feedId).first<{json:string}>();
    if(saved){
      const receipt=JSON.parse(saved.json) as {token:string;response:ModelResponse};
      await settleModelSpending(db,id,receipt.token,{costUsd:receipt.response.costUsd!,reported:true});
      return receipt.response;
    }
    if(await db.prepare('SELECT id FROM v1_model_spending_reservations WHERE id=?').bind(id).first())throw new UnreadSummaryError('SUMMARY_OUTCOME_UNKNOWN');
    const capability=modelCapability(request.model,env.V1_MODEL_CAPABILITIES_JSON);
    if(!capability)throw new BriefingBudgetError('Summary model is not configured.');
    const token=crypto.randomUUID(),at=new Date().toISOString();
    const estimate=summaryTokenUpperBound(request)*capability.inputUsdPerToken+request.maxTokens*capability.outputUsdPerToken;
    try{
      const accountId=await modelSpendingAccount(db,request.model,at);
      await reserveModelSpending(db,{id,accountId,feedId,model:request.model,token,reservedCostUsd:estimate,createdAt:at,leaseUntil:Date.now()+120_000,providerLimits:configuredProviderLimits(env,'openrouter')});
    }catch(error){
      if(error instanceof ModelSpendingWait&&error.reason==='PROVIDER_RESOURCE_WAIT')throw new UnreadSummaryResourceWait();
      console.warn('unread-summary-admission-failed',{reason:error instanceof ModelSpendingWait?error.reason:'DATABASE_OR_CONFIGURATION_FAILURE'});
      throw new BriefingBudgetError('Summaries are temporarily unavailable. Try again shortly.');
    }
    let response:ModelResponse;
    try{response=await raw.complete(request);}
    catch(error){
      if(error instanceof BriefingModelError&&!error.uncertain)await settleModelSpending(db,id,token,{costUsd:0,reported:true});
      throw error;
    }
    if(!Number.isFinite(response.costUsd)||response.costUsd!<0)throw Error('Summary usage could not be confirmed.');
    await db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('unread_summary_provider',?,?,?) ON CONFLICT(kind,id) DO NOTHING").bind(id,feedId,JSON.stringify({token,response,createdAt:at})).run();
    await settleModelSpending(db,id,token,{costUsd:response.costUsd!,reported:true});
    return response;
  }};
}
