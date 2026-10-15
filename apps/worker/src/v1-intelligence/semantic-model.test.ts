import {it,expect,vi} from 'vitest';
import {createStrongSemanticModel} from './semantic-model';
import {ASYNC_MODEL_CALL_MS} from './operation-timing';
import type {Env} from '../types';
const objectSchema=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const storiesSchema=objectSchema({stories:{type:'array',items:objectSchema({})}});
const groupsSchema=objectSchema({groups:{type:'array',items:objectSchema({})}});
it('invalid provider schema is rejected before execution without financial uncertainty',async()=>{
 let calls=0;const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,async()=>{calls++;throw Error('Must not call provider')})!;
 await expect(model.complete('feed','SEMANTIC_CONSTRUCTION',{},{})).rejects.toThrow('SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED');
 expect(calls).toBe(0);expect(model.usage()).toEqual({calls:0,costUsd:0,reported:true});
});
it('retains unknown-charge reservation and the exact timeout reason instead of masking planner timeout as provider failure',async()=>{
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,async()=>{throw new DOMException('Aborted','AbortError')})!;
 await expect(model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},storiesSchema)).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');
 expect(model.usage()).toEqual({calls:1,tokensIn:0,tokensOut:0,costUsd:model.admission!({facts:[]},storiesSchema,'COMPARATIVE_EDITORIAL_PLAN').reservationCostUsd,reported:false});
});

it('a comparative response can complete after forty-five seconds while remaining bounded by the configured asynchronous deadline',async()=>{
 await import('../provider-receipt');
 vi.useFakeTimers();try{
 const fetcher=(async(_url:any,init:any)=>{await new Promise<void>((resolve,reject)=>{setTimeout(resolve,55000);init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({stories:[]})}}],usage:{prompt_tokens:100,completion_tokens:20,cost:.001}}))}) as typeof fetch;
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,fetcher,'EDITORIAL')!;
 const pending=model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},storiesSchema);await vi.advanceTimersByTimeAsync(55000);expect((await pending).value).toEqual({stories:[]});
 const slow=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,async(_url,init)=>new Promise((_resolve,reject)=>{(init?.signal as AbortSignal).addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))}),'EDITORIAL')!;
 const timeout=slow.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},storiesSchema);let settled=false;void timeout.then(()=>{settled=true},()=>{settled=true});const checked=expect(timeout).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');await vi.advanceTimersByTimeAsync(ASYNC_MODEL_CALL_MS-1);expect(settled).toBe(false);await vi.advanceTimersByTimeAsync(1);await checked;expect(slow.usage().reported).toBe(false);
 }finally{vi.useRealTimers()}
});

it('admits an oversized feasibility input using actual model context, not the historical 48KB guard',async()=>{
 let sent:any,calls=0;
 const fetcher=(async(_url:any,init:any)=>{calls++;sent=JSON.parse(init.body);return Response.json({choices:[{message:{content:JSON.stringify({stories:[]})}}],usage:{prompt_tokens:15000,completion_tokens:100,cost:.03}})}) as typeof fetch;
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,fetcher,'EDITORIAL')!;
 const state={supportedFacts:'Supported retained development. '.repeat(1800),previousProposal:{stories:{}},feasibilityFeedback:{violations:['INPUT_CAPACITY']}};
 expect(new TextEncoder().encode(JSON.stringify(state)).length).toBeGreaterThan(48000);
 expect((await model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',state,storiesSchema)).value).toEqual({stories:[]});
 expect(calls).toBe(1);expect(JSON.parse(sent.messages[1].content)).toEqual(state);
 expect(sent.max_tokens).toBe(32768);expect(model.usage().costUsd).toBe(.03);
});

it('uses provider output capacity without the retired wallet or output request cutoff',()=>{
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,async()=>{throw Error('NO_PROVIDER')},'EDITORIAL')!;
 const envelope=model.admission!({facts:[]},storiesSchema);
 expect(envelope.fits).toBe(true);expect(envelope.maxOutputTokens).toBe(32768);expect(envelope.reservationCostUsd).toBeGreaterThan(.02);
});

it('preserves a supported larger response and reported costs above the historical telemetry ceiling',async()=>{
 const response={retained:'Supported text. '.repeat(10000)};
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'stand-in-only',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,async()=>Response.json({choices:[{message:{content:JSON.stringify(response)}}],usage:{prompt_tokens:100,completion_tokens:20000,cost:12}}))!;
 expect((await model.complete('feed','SEMANTIC_CONSTRUCTION',{},objectSchema({retained:{type:'string'}}))).value).toEqual(response);expect(model.usage()).toMatchObject({costUsd:12,reported:true});
});

it.each(['SEMANTIC_CONSTRUCTION','SEMANTIC_CONSTRUCTION_REPAIR','SEMANTIC_RECONCILIATION'])('allows a valid %s response after the historical ten-second deadline',async phase=>{
 vi.useFakeTimers();try{
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'stand-in-only'} as Env,async(_url,init)=>{await new Promise<void>((resolve,reject)=>{setTimeout(resolve,35000);init!.signal!.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))});return Response.json({choices:[{message:{content:'{"groups":[]}'}}],usage:{prompt_tokens:100,completion_tokens:20,cost:.001}})})!;
 const response=model.complete('feed',phase,{completeArticle:'Source evidence'},groupsSchema);await vi.advanceTimersByTimeAsync(35000);expect((await response).value).toEqual({groups:[]});expect(model.usage().reported).toBe(true);
 }finally{vi.useRealTimers()}
});
