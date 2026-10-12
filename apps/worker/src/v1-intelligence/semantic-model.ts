import {admitModelOperation,modelCapability,type ModelAdmission} from './model-capacity';
import {boundedCompletion} from '../ai';
import type {Env} from '../types';
import type {ExperimentUsage} from './salience';
export interface StrongSemanticModel {model:string;admission?(state:unknown,schema:object,phase?:string):ModelAdmission;complete(feedId:string,phase:string,state:unknown,schema:object):Promise<{value:Record<string,unknown>;usage:ExperimentUsage}>;usage():ExperimentUsage}
/** Existing bounded structured transport; no tools, search or source discovery. */
export function createStrongSemanticModel(env:Env,fetcher:typeof fetch=fetch,purpose:'EVENT'|'EDITORIAL'='EVENT'):StrongSemanticModel|undefined {
 if(!env.OPENROUTER_API_KEY || (purpose==='EVENT'?env.V1_SEMANTIC_POLICY==='DETERMINISTIC':env.V1_EDITORIAL_MODEL_POLICY==='DETERMINISTIC'))return undefined;
 const model=env.V1_SEMANTIC_STRONG_MODEL??'openai/gpt-4.1',capability=modelCapability(model,env.V1_MODEL_CAPABILITIES_JSON);let usage:ExperimentUsage={calls:0,costUsd:0,reported:true};
 // Existing response execution requests are explicit rollout compatibility,
 // not model capabilities. Incremental output continuation replaces them
 // together with account authorization; do not disable the existing default
 // route between checkpoints by reserving the entire provider output window.
 const admission=(state:unknown,schema:object,phase=purpose==='EDITORIAL'?'COMPARATIVE_EDITORIAL_PLAN':'SEMANTIC_CONSTRUCTION')=>admitModelOperation(model,state,schema,capability,phase==='COMPARATIVE_EDITORIAL_PLAN'?8000:2200);
 return {model,admission,usage:()=>({...usage}),complete:async(feedId,phase,state,schema)=>{
  const envelope=admission(state,schema,phase);
  if(!envelope.fits)throw Error(`SEMANTIC_${envelope.reason}`);
  usage={calls:1,costUsd:envelope.reservationCostUsd,reported:false};
  // Complete multi-target planning needs more time than one construction call.
  // Keep it below the comparative operation's 90-second lease; token/cost bounds
  // and unknown-outcome fencing are unchanged.
  const timeoutMs=phase==='COMPARATIVE_EDITORIAL_PLAN'?60000:10000;
  let value:Record<string,unknown>;try{value=await boundedCompletion({accountId:'',gatewayId:'',apiKey:env.OPENROUTER_API_KEY!,provider:'OPENROUTER',model,fetcher,timeoutMs,usageRecorder:async record=>{usage={calls:1,tokensIn:record.inputTokens,tokensOut:record.outputTokens,costUsd:record.reportedCostUsd??envelope.reservationCostUsd,reported:record.reportedCostUsd!==undefined}}},feedId,'event_review',phase,JSON.stringify(state),schema,{maxOutputTokens:envelope.maxOutputTokens,signal:new AbortController().signal});
  }catch(error){throw Error(error instanceof Error&&/^MODEL_|^PROVIDER_HTTP_/.test(error.message)?`SEMANTIC_${error.message}`:"SEMANTIC_PROVIDER_FAILURE")}
  return {value,usage};
 }};
}
