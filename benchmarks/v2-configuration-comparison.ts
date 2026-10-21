import {createHash} from 'node:crypto';
export type Effort='none'|'low'|'medium';
export function comparisonProfiles(baseline='openai/gpt-4.1-mini'){
 const all=(model:string)=>Object.fromEntries(['construction','reconciliation','editorial','writer','verification','relation','novelty','repair'].map(task=>[task,model]));
 return {A:all('openai/gpt-6-luna'),B:{...all('deepseek/deepseek-v4.1-flash'),editorial:'xiaomi/mimo-v2.6-pro',writer:'anthropic/claude-haiku-5.5',verification:'openai/gpt-6-luna'},C:all(baseline)};
}
export interface InitialState {evidenceHash:string;publicationMemoryHash:string;initialGraphHash:string}
export interface CatalogModel {id:string;canonical_slug:string;context_length:number;top_provider:{max_completion_tokens:number};supported_parameters:string[];pricing:{prompt:string;completion:string;overrides?:{prompt?:string;completion?:string}[]}}
export interface TrialInput extends InitialState {profile:string;phase:string;model:string;effort?:Effort;reasoningEnabled?:false;catalog:CatalogModel;body:Record<string,any>}
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
/** Evaluation-only request preparation. No network, authorization, settlement,
 * production qualification, or changes to the existing publication pipeline. */
export function prepareComparisonRequest(input:TrialInput){
 const {catalog,model,phase,profile,effort,reasoningEnabled,evidenceHash,publicationMemoryHash,initialGraphHash}=input;
 if(![evidenceHash,publicationMemoryHash,initialGraphHash,profile,phase].every(v=>typeof v==='string'&&v.trim())||catalog.id!==model||input.body.model!==model||!catalog.canonical_slug)throw Error('INVALID_TRIAL_IDENTITY');
 if(!catalog.supported_parameters.includes('structured_outputs')||input.body.response_format?.type!=='json_schema')throw Error('STRUCTURED_OUTPUT_UNSUPPORTED');
 const body=structuredClone(input.body);
 // Never inherit a previous trial's effort, and never assume unsupported
 // sampling parameters are harmlessly ignored by the serving provider.
 delete body.reasoning;delete body.reasoning_effort;
 if(!catalog.supported_parameters.includes('temperature'))delete body.temperature;
 if(reasoningEnabled===false){if(effort!==undefined)throw Error('CONFLICTING_REASONING_SETTINGS');if(!catalog.supported_parameters.includes('reasoning'))throw Error('UNSUPPORTED_REASONING_DISABLE');body.reasoning={enabled:false};}
 if(effort!==undefined){if(!['none','low','medium'].includes(effort)||!catalog.supported_parameters.includes('reasoning_effort'))throw Error('UNSUPPORTED_REASONING_EFFORT');body.reasoning_effort=effort;}
 body.provider={...(body.provider??{}),require_parameters:true,allow_fallbacks:false};
 const rates=[catalog.pricing,...(catalog.pricing.overrides??[])];
 const maxRate=(key:'prompt'|'completion')=>{const values=rates.map(r=>r[key]).filter(v=>v!==undefined).map(Number);if(!values.length||values.some(n=>!Number.isFinite(n)||n<0))throw Error('UNVERIFIED_BILLING_RATE');return Math.max(...values);};
 const inputRate=maxRate('prompt'),outputRate=maxRate('completion');
 const outputTokens=body.max_completion_tokens??body.max_tokens;
 if(!Number.isSafeInteger(outputTokens)||outputTokens<=0||outputTokens>catalog.top_provider.max_completion_tokens)throw Error('INVALID_OUTPUT_ALLOWANCE');
 const inputTokenUpperBound=Buffer.byteLength(JSON.stringify(body),'utf8');
 if(!Number.isSafeInteger(catalog.context_length)||inputTokenUpperBound+outputTokens>catalog.context_length)throw Error('TRIAL_CONTEXT_CAPACITY');
 const operationHash=hash({profile,phase,model,canonicalModel:catalog.canonical_slug,evidenceHash,publicationMemoryHash,initialGraphHash,body});
 return {body,operationHash,canonicalModel:catalog.canonical_slug,inputTokenUpperBound,maxOutputTokens:outputTokens,reservationUsd:Math.ceil((inputTokenUpperBound*inputRate+outputTokens*outputRate)*1e6)/1e6,productionQualified:false as const};
}
export function assertMatchedInitialState(inputs:InitialState[]){
 if(inputs.length<2)throw Error('INSUFFICIENT_COMPARISON_ARMS');
 for(const key of ['evidenceHash','publicationMemoryHash','initialGraphHash'] as const)if(!inputs[0][key]||inputs.some(i=>i[key]!==inputs[0][key]))throw Error('UNMATCHED_INITIAL_STATE');
}

/** SSE heartbeats are comments, not a missing model identity. */
export function comparisonResponseModels(raw:string):string[]{
 const frames=/^data:/m.test(raw)?raw.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()):[raw];
 const models:string[]=[];for(const frame of frames){try{const value=JSON.parse(frame);if(typeof value.model==='string')models.push(value.model)}catch{}}
 return [...new Set(models)];
}
