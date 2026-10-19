import {DuplicateModelKeyError} from '../strict-model-json';
import {SemanticValidationError} from './semantic-operations';
import {ASYNC_MODEL_CALL_MS,ASYNC_JUDGMENT_CALL_MS} from './operation-timing';
import {ProviderRequestError} from '../provider-outcome';
import {admitModelOperation,modelCapability,type ModelAdmission} from './model-capacity';
import {boundedCompletion} from '../ai';
import type {Env} from '../types';
import type {ExperimentUsage} from './salience';
export interface StrongSemanticModel {model:string;admission?(state:unknown,schema:object,phase?:string):ModelAdmission;complete(feedId:string,phase:string,state:unknown,schema:object):Promise<{value:Record<string,unknown>;usage:ExperimentUsage;rawResponse?:string}>;usage():ExperimentUsage}
/** Existing bounded structured transport; no tools, search or source discovery. */
export function createStrongSemanticModel(env:Env,fetcher:typeof fetch=fetch,purpose:'EVENT'|'EDITORIAL'='EVENT'):StrongSemanticModel|undefined {
 if(!env.OPENROUTER_API_KEY || (purpose==='EVENT'?env.V1_SEMANTIC_POLICY==='DETERMINISTIC':env.V1_EDITORIAL_MODEL_POLICY==='DETERMINISTIC'))return undefined;
 const model=env.V1_SEMANTIC_STRONG_MODEL??'openai/gpt-4.1',capability=modelCapability(model,env.V1_MODEL_CAPABILITIES_JSON);let usage:ExperimentUsage={calls:0,costUsd:0,reported:true};
 const admission=(state:unknown,schema:object,_phase?:string)=>admitModelOperation(model,state,schema,capability?.transport==='DECISIONS'?undefined:capability);
 return {model,admission,usage:()=>({...usage}),complete:async(feedId,phase,state,schema)=>{
  usage={calls:0,costUsd:0,reported:true};
  const envelope=admission(state,schema,phase);
  if(!envelope.fits)throw Error(`SEMANTIC_${envelope.reason}`);
  usage={calls:1,costUsd:envelope.reservationCostUsd,reported:false};
  // Complete construction, targeted repair and reconciliation need the same
  // operational headroom as comparative planning. Durable ownership is renewed
  // before each operation; the financial lease has additional settlement margin.
  const timeoutMs=phase==='COMPARATIVE_EDITORIAL_PLAN'||phase.startsWith('SEMANTIC_')?ASYNC_MODEL_CALL_MS:ASYNC_JUDGMENT_CALL_MS;
  const construction=phase.startsWith('SEMANTIC_CONSTRUCTION')||phase==='SEMANTIC_RECONCILIATION';let rawResponse:string|undefined;let value:Record<string,unknown>;try{value=await boundedCompletion({accountId:'',gatewayId:'',apiKey:env.OPENROUTER_API_KEY!,provider:'OPENROUTER',model,fetcher,timeoutMs,usageRecorder:async record=>{usage={calls:1,tokensIn:record.inputTokens,tokensOut:record.outputTokens,costUsd:record.reportedCostUsd??envelope.reservationCostUsd,reported:record.reportedCostUsd!==undefined}}},feedId,'event_review',phase,JSON.stringify(state),schema,{maxOutputTokens:envelope.maxOutputTokens,signal:new AbortController().signal,...(construction||phase==='COMPARATIVE_EDITORIAL_PLAN'?{uniqueJsonKeys:true,onRawContent:(raw:string)=>{rawResponse=raw}}:{})});
  }catch(error){if(error instanceof DuplicateModelKeyError)throw new SemanticValidationError({stage:'OUTPUT_SCHEMA',response:{},rawResponse:error.rawResponse,rejection:{name:error.name,code:'DUPLICATE_JSON_KEY',mechanicalIssues:error.mechanicalIssues}});if(error instanceof ProviderRequestError)throw new ProviderRequestError('SEMANTIC_'+error.message,error.providerDiagnostic);throw Error(error instanceof Error&&/^MODEL_|^PROVIDER_HTTP_/.test(error.message)?`SEMANTIC_${error.message}`:"SEMANTIC_PROVIDER_FAILURE")}
  return {value,usage,...(rawResponse!==undefined?{rawResponse}:{})};
 }};
}
