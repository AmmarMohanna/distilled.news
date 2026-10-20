import {createStoredEvidenceModel} from './model';
import {it,expect} from 'vitest';
import {llmRoute,routeAdmission,TASKS} from './provider-routing';
import {workersAiCompletion} from '../workers-ai';
it('defaults every generative task to qualified-gated Cloudflare with distinct durable identities',()=>{
 for(const task of TASKS){const route=llmRoute({} as any,task);expect(route.provider).toBe('workers_ai');expect(route.identity).toMatch(/^workers_ai:@cf\//);expect(routeAdmission({} as any,route,{},{}).fits).toBe(false);}
 const old=llmRoute({DISTILLED_LLM_API_GATEWAY:'openrouter'} as any,'construction');expect(old.identity).toBe('openai/gpt-4.1');
 expect(()=>llmRoute({DISTILLED_LLM_API_GATEWAY:'typo'} as any,'writer')).toThrow();
});
it('never treats configuration as real qualification or permits implicit provider fallback',()=>{
 const env:any={AI:{run:async()=>{throw Error('MUST_NOT_CALL')}},V1_LLM_ROUTES_JSON:JSON.stringify({construction:{provider:'workers_ai',model:'@cf/qwen/qwen3-30b-a3b-fp8',qualified:true}})};
 const route=llmRoute(env,'construction');expect(routeAdmission(env,route,{},{}).reason).toBe('MODEL_UNQUALIFIED');
});
it('translates native binding requests and preserves unreported billing',async()=>{
 let request:any;const value=await workersAiCompletion({run:async(model,input)=>{request={model,input};return {response:'{"ok":true}',usage:{prompt_tokens:13,completion_tokens:5}}}},'@cf/qwen/qwen3-30b-a3b-fp8','source',{},32,new AbortController().signal);
 expect(request.input.response_format).toEqual({type:'json_schema',json_schema:{}});expect(request.input.stream).toBe(false);
 expect(value.choices[0].message.content).toBe('{"ok":true}');expect(value.usage.cost).toBeUndefined();
});
it('rejects mismatched identities, incomplete output and does not retry binding failures',async()=>{
 let calls=0;const run=async()=>{calls++;throw Error('unknown')};await expect(workersAiCompletion({run},'m','s',{},32,new AbortController().signal)).rejects.toThrow();expect(calls).toBe(1);
 await expect(workersAiCompletion({run:async()=>({model:'other',choices:[{message:{content:'{}'},finish_reason:'stop'}]})},'m','s',{},32,new AbortController().signal)).rejects.toThrow('IDENTITY');
 await expect(workersAiCompletion({run:async()=>({choices:[{message:{content:'{}'},finish_reason:'length'}]})},'m','s',{},32,new AbortController().signal)).rejects.toThrow('CONTINUATION');
});

it('binds writer and verification durable identities to the actual per-task routes',()=>{
 const env:any={V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'OFFLINE',V1_LLM_ROUTES_JSON:JSON.stringify({verification:{provider:'openrouter',model:'openai/gpt-4.1'}})};
 const model=createStoredEvidenceModel(env)!;
 expect(model.phaseIdentity!('SYNTHESIS').model).toBe('openai/gpt-4.1-mini');expect(model.phaseIdentity!('GROUNDING').model).toBe('openai/gpt-4.1');
 expect(model.admission!({payload:{},schema:{}},'GROUNDING').reservationCostUsd).toBeGreaterThan(model.admission!({payload:{},schema:{}},'SYNTHESIS').reservationCostUsd);
});
