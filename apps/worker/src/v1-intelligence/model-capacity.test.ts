import {it,expect} from 'vitest';
import {admitModelOperation,modelCapability,type ModelCapability} from './model-capacity';
import {structuredCompletionBody} from '../ai';
import {createStrongSemanticModel} from './semantic-model';
import type {Env} from '../types';
it('counts the actual complete request, including schema, framing and UTF-8 evidence',()=>{
 const c=modelCapability('openai/gpt-4.1-mini')!,state={text:'Supported factual news. '.repeat(2400)},schema={type:'object',additionalProperties:false,required:['fact'],properties:{fact:{type:'string',enum:['Approved exact source text']}}};
 const r=admitModelOperation('openai/gpt-4.1-mini',state,schema,c);
 expect(r.fits).toBe(true);expect(r.requestBytes).toBe(new TextEncoder().encode(JSON.stringify(structuredCompletionBody('openai/gpt-4.1-mini',JSON.stringify(state),schema,32768))).length);
 expect(r.reservationCostUsd).toBeGreaterThan(.02);expect(r.inputTokenUpperBound+32768).toBeLessThanOrEqual(1047576);
});
it('schema and output capacity participate in genuine context admission',()=>{
 const c:ModelCapability={contextTokens:1000,maxOutputTokens:100,inputUsdPerToken:0,outputUsdPerToken:0,source:'test descriptor'};
 expect(admitModelOperation('test',{}, {},c).fits).toBe(true);
 expect(admitModelOperation('test',{}, {enum:['Bound source '.repeat(100)]},c)).toMatchObject({fits:false,reason:'MODEL_CONTEXT_CONTINUATION_REQUIRED'});
});
it('unknown capabilities and true context overflow never invoke the paid transport',async()=>{
 let calls=0;const fetcher=(async()=>{calls++;throw Error('NO_PROVIDER_CALL')}) as typeof fetch;
 const unknown=createStrongSemanticModel({DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'unknown-route'} as Env,fetcher)!;
 await expect(unknown.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{},{})).rejects.toThrow('SEMANTIC_MODEL_CAPABILITY_UNAVAILABLE');
 const configured=JSON.stringify({known:{contextTokens:1000,maxOutputTokens:100,inputUsdPerToken:0,outputUsdPerToken:0,source:'verified test provider'}});
 const limited=createStrongSemanticModel({DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'known',V1_MODEL_CAPABILITIES_JSON:configured} as Env,fetcher)!;
 await expect(limited.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{text:'x'.repeat(1500)},{})).rejects.toThrow('SEMANTIC_MODEL_CONTEXT_CONTINUATION_REQUIRED');
 expect(calls).toBe(0);expect(limited.usage()).toMatchObject({calls:0,costUsd:0,reported:true});
});

it('allocates the actual model output capability and classifies completed output exhaustion distinctly',async()=>{
 let body:any;const fetcher=(async(_u:any,init:any)=>{body=JSON.parse(init.body);return Response.json({choices:[{finish_reason:'length',message:{content:'{"groups":['}}],usage:{prompt_tokens:120,completion_tokens:32768,cost:.12}})}) as typeof fetch;
 const model=createStrongSemanticModel({DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'fixture'} as Env,fetcher)!;
 await expect(model.complete('feed','SEMANTIC_CONSTRUCTION',{claimMentions:[{id:'m1',text:'supported'}]},{type:'object',properties:{},required:[],additionalProperties:false})).rejects.toThrow('SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED');
 expect(body.max_tokens).toBe(32768);expect(model.usage()).toMatchObject({calls:1,costUsd:.12,reported:true});
});
