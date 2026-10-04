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
  const value=await boundedCompletion({accountId:'',gatewayId:'',apiKey:env.OPENROUTER_API_KEY!,provider:'OPENROUTER',model,fetcher,timeoutMs:10000,usageRecorder:async record=>{usage={calls:1,tokensIn:record.inputTokens,tokensOut:record.outputTokens,costUsd:record.reportedCostUsd??.02,reported:record.reportedCostUsd!==undefined}}},feedId,'event_review',phase,JSON.stringify(state),schema,{maxOutputTokens:2200,signal:new AbortController().signal});
  return {value,usage};
 }};
}
