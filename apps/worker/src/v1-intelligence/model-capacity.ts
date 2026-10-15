import {structuredCompletionBody} from '../ai';
import {inspectProviderSchema,type SchemaAdmission} from '../provider-schema';
export interface ModelCapability {contextTokens:number;maxOutputTokens:number;inputUsdPerToken:number;outputUsdPerToken:number;source:string;transport?:'STRUCTURED_COMPLETION'|'DECISIONS'}
export interface ModelAdmission {fits:boolean;reason?:'MODEL_CAPABILITY_UNAVAILABLE'|'MODEL_CONTEXT_CONTINUATION_REQUIRED'|'MODEL_SCHEMA_CONTINUATION_REQUIRED';schemaAdmission?:SchemaAdmission;requestBytes:number;inputTokenUpperBound:number;maxOutputTokens:number;reservationCostUsd:number;capability?:ModelCapability}
/** Capability evidence, not spend permission. https://openrouter.ai/api/v1/models,
 * checked 2026-10-12. Unknown routes require an operator-verified descriptor.
 * The override can reflect a narrower selected provider context. */
const verified:Record<string,ModelCapability>={
 'typesafe/jev-1.13':{contextTokens:64000,maxOutputTokens:0,transport:'DECISIONS',inputUsdPerToken:.000000042,outputUsdPerToken:0,source:'openrouter-model-page-2026-10-12-decisions'},
 'openai/gpt-4.1-mini':{contextTokens:1047576,maxOutputTokens:32768,inputUsdPerToken:.0000004,outputUsdPerToken:.0000016,source:'openrouter-catalog-2026-10-12'},
 'openai/gpt-4.1':{contextTokens:1047576,maxOutputTokens:32768,inputUsdPerToken:.000002,outputUsdPerToken:.000008,source:'openrouter-catalog-2026-10-12'}
};
export function modelCapability(model:string,configured?:string):ModelCapability|undefined {
 const c=configured?JSON.parse(configured)?.[model]:verified[model];if(!c)return undefined;
 if(!Number.isSafeInteger(c.contextTokens)||!Number.isSafeInteger(c.maxOutputTokens)||c.maxOutputTokens<(c.transport==='DECISIONS'?0:1)||c.contextTokens<=c.maxOutputTokens||![c.inputUsdPerToken,c.outputUsdPerToken].every(n=>Number.isFinite(n)&&n>=0)||typeof c.source!=='string'||!c.source)throw Error('SEMANTIC_MODEL_CAPABILITY_INVALID');
 return {...c};
}
/** Byte-tokenized text has at most one token per UTF-8 byte. Counting the whole
 * serialized request (including schema and message framing) is conservative;
 * this is NOT measured usage and never an editorial word/story allowance. */
export function admitModelOperation(model:string,state:unknown,schema:object,capability:ModelCapability|undefined,requestedOutputTokens?:number):ModelAdmission {
 if(!capability)return {fits:false,reason:'MODEL_CAPABILITY_UNAVAILABLE',requestBytes:0,inputTokenUpperBound:0,maxOutputTokens:0,reservationCostUsd:0};
 const maxOutputTokens=Math.min(capability.maxOutputTokens,requestedOutputTokens??capability.maxOutputTokens);
 if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1)throw Error('SEMANTIC_MODEL_OUTPUT_INVALID');
 const requestBytes=new TextEncoder().encode(JSON.stringify(structuredCompletionBody(model,JSON.stringify(state),schema,maxOutputTokens))).length;
 const schemaAdmission=inspectProviderSchema(model,schema);
 const fits=schemaAdmission.fits&&requestBytes+maxOutputTokens<=capability.contextTokens;
 return {fits,...(!fits?{reason:!schemaAdmission.fits?'MODEL_SCHEMA_CONTINUATION_REQUIRED' as const:'MODEL_CONTEXT_CONTINUATION_REQUIRED' as const}:{}),schemaAdmission,requestBytes,inputTokenUpperBound:requestBytes,maxOutputTokens,reservationCostUsd:requestBytes*capability.inputUsdPerToken+maxOutputTokens*capability.outputUsdPerToken,capability};
}
