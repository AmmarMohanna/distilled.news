import type {Env} from '../types';
import type {ModelOptions} from '../ai';
import {admitModelOperation,modelCapability,type ModelAdmission} from './model-capacity';
export const TASKS=['relation','novelty','construction','reconciliation','editorial','writer','verification','repair'] as const;
export type LlmTask=typeof TASKS[number];
export interface LlmRoute {task:LlmTask;provider:'cloudflare'|'workers_ai'|'openrouter';model:string;identity:string}
export const CLOUDFLARE_CANDIDATE='@cf/qwen/qwen3-30b-a3b-fp8';
/** Empty until real saved-evidence compatibility, quality AND billing/recovery checks pass.
 * Operator JSON cannot turn mock results into production qualification. */
const qualified:ReadonlySet<string>=new Set();
export function llmRoute(env:Partial<Env>,task:LlmTask):LlmRoute {
 const mappings=env.V1_LLM_ROUTES_JSON?JSON.parse(env.V1_LLM_ROUTES_JSON):{};
 if(!mappings||typeof mappings!=='object'||Array.isArray(mappings)||Object.keys(mappings).some(k=>!TASKS.includes(k as LlmTask)))throw Error('INVALID_LLM_TASK_CONFIGURATION');
 const override=mappings[task];
 if(override&&(!override.model||typeof override.model!=='string'||Object.keys(override).some(k=>!['provider','model','qualified'].includes(k))))throw Error('INVALID_LLM_TASK_CONFIGURATION');
 const provider=override?.provider??env.DISTILLED_LLM_API_GATEWAY??'cloudflare';
 if(!['cloudflare','workers_ai','openrouter'].includes(provider))throw Error('INVALID_LLM_PROVIDER');
 const model=override?.model??(provider==='workers_ai'?CLOUDFLARE_CANDIDATE:provider==='cloudflare'?(task==='writer'?'openai/gpt-4.1-mini':env.V1_SEMANTIC_STRONG_MODEL??'openai/gpt-4.1'):['relation','novelty'].includes(task)?env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13':['writer','verification'].includes(task)?env.DISTILLED_LIVE_OPENROUTER_MODEL??'openai/gpt-4.1-mini':env.V1_SEMANTIC_STRONG_MODEL??'openai/gpt-4.1');
 if(provider==='workers_ai'&&!model.startsWith('@cf/'))throw Error('INVALID_WORKERS_AI_MODEL');
 if(provider==='openrouter'&&model.startsWith('@cf/'))throw Error('INVALID_OPENROUTER_MODEL');
 if(provider==='cloudflare'&&!['openai/gpt-4.1','openai/gpt-4.1-mini'].includes(model))throw Error('UNSUPPORTED_CLOUDFLARE_MODEL');
 return {task,provider,model,identity:provider==='openrouter'?model:provider+':'+model};
}
export function routeAdmission(env:Partial<Env>,route:LlmRoute,state:unknown,schema:object,output?:number):ModelAdmission {
 const denied=(reason:'MODEL_UNQUALIFIED'|'MODEL_BINDING_UNAVAILABLE'):ModelAdmission=>({fits:false,reason,requestBytes:0,inputTokenUpperBound:0,maxOutputTokens:0,reservationCostUsd:0});
 if(route.provider!=='openrouter'&&!qualified.has(route.provider+':'+route.task+':'+route.model))return denied('MODEL_UNQUALIFIED');
 if(route.provider==='workers_ai'&&!env.AI||route.provider==='openrouter'&&!env.OPENROUTER_API_KEY)return denied('MODEL_BINDING_UNAVAILABLE');
 if(route.provider==='cloudflare'&&(!env.CLOUDFLARE_AI_GATEWAY_TOKEN||!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[a-zA-Z0-9_-]{1,64}$/.test(env.CLOUDFLARE_AI_GATEWAY_ID??'')))return denied('MODEL_BINDING_UNAVAILABLE');
 return {...admitModelOperation(route.identity,state,schema,modelCapability(route.identity,env.V1_MODEL_CAPABILITIES_JSON),output),providerLimits:configuredProviderLimits(env,route.provider)};
}
export function phaseTask(phase:string):LlmTask {
 if(phase.includes('REPAIR'))return 'repair';if(phase.includes('RECONCILIATION'))return 'reconciliation';
 if(phase==='GROUNDING')return 'verification';if(phase==='SYNTHESIS')return 'writer';
 if(phase.includes('EDITORIAL'))return 'editorial';if(phase.includes('NOVELTY'))return 'novelty';
 if(phase.includes('RELATION'))return 'relation';return 'construction';
}

export function configuredProviderLimits(env:Partial<Env>,provider:LlmRoute['provider']):import('./provider-limits').ProviderLimits{
 const maxConcurrent=Number(env.V1_PROVIDER_MAX_CONCURRENCY??3),requestsPerMinute=Number(env.V1_PROVIDER_REQUESTS_PER_MINUTE??20);
 if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>6||!Number.isSafeInteger(requestsPerMinute)||requestsPerMinute<1)throw Error('INVALID_PROVIDER_LIMITS');
 return {provider,maxConcurrent,requestsPerMinute};
}
/** Provider credentials never cross routes. Historical OpenRouter options stay byte-compatible. */
export function modelOptionsForRoute(env:Partial<Env>,route:LlmRoute,fetcher?:typeof fetch):ModelOptions {
 return {accountId:route.provider==='cloudflare'?env.CLOUDFLARE_ACCOUNT_ID??'':'',gatewayId:route.provider==='cloudflare'?env.CLOUDFLARE_AI_GATEWAY_ID??'default':'',apiKey:route.provider==='cloudflare'?env.CLOUDFLARE_AI_GATEWAY_TOKEN??'':env.OPENROUTER_API_KEY??'',provider:route.provider==='cloudflare'?'CLOUDFLARE':route.provider==='workers_ai'?'WORKERS_AI':'OPENROUTER',model:route.identity,env,...(fetcher?{fetcher}:{})};
}
