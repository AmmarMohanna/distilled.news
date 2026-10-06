import {boundedCompletion} from '../ai';
import type {Env} from '../types';
import type {ExperimentUsage} from './salience';
export interface StrongSemanticModel {model:string;complete(feedId:string,phase:string,state:unknown,schema:object):Promise<{value:Record<string,unknown>;usage:ExperimentUsage}>;usage():ExperimentUsage}
/** Existing bounded structured transport; no tools, search or source discovery. */
export function createStrongSemanticModel(env:Env,fetcher:typeof fetch=fetch):StrongSemanticModel|undefined {
 if(!env.OPENROUTER_API_KEY || env.V1_SEMANTIC_POLICY==='DETERMINISTIC')return undefined;
 const model=env.V1_SEMANTIC_STRONG_MODEL??'openai/gpt-4.1';let usage:ExperimentUsage={calls:0,costUsd:0,reported:true};
 return {model,usage:()=>({...usage}),complete:async(feedId,phase,state,schema)=>{
  if(new TextEncoder().encode(JSON.stringify(state)).length>48000)throw Error('SEMANTIC_INPUT_LIMIT');
  usage={calls:1,costUsd:.02,reported:false};
  // Complete multi-target planning needs more time than one construction call.
  // Keep it below the durable operation's 30-second lease; token/cost bounds
  // and unknown-outcome fencing are unchanged.
  const timeoutMs=phase==='COMPARATIVE_EDITORIAL_PLAN'?20000:10000;
  let value:Record<string,unknown>;try{value=await boundedCompletion({accountId:'',gatewayId:'',apiKey:env.OPENROUTER_API_KEY!,provider:'OPENROUTER',model,fetcher,timeoutMs,usageRecorder:async record=>{usage={calls:1,tokensIn:record.inputTokens,tokensOut:record.outputTokens,costUsd:record.reportedCostUsd??.02,reported:record.reportedCostUsd!==undefined}}},feedId,'event_review',phase,JSON.stringify(state),schema,{maxOutputTokens:2200,signal:new AbortController().signal});
  }catch(error){throw Error(error instanceof Error&&/^MODEL_|^PROVIDER_HTTP_/.test(error.message)?`SEMANTIC_${error.message}`:"SEMANTIC_PROVIDER_FAILURE")}
  return {value,usage};
 }};
}
