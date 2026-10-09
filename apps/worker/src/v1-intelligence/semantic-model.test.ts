import {it,expect,vi} from 'vitest';
import {createStrongSemanticModel} from './semantic-model';
import type {Env} from '../types';
it('retains unknown-charge reservation and the exact timeout reason instead of masking planner timeout as provider failure',async()=>{
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env,async()=>{throw new DOMException('Aborted','AbortError')})!;
 await expect(model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},{})).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');
 expect(model.usage()).toEqual({calls:1,tokensIn:0,tokensOut:0,costUsd:.02,reported:false});
});

it('a comparative response can complete after forty-five seconds while remaining bounded at sixty',async()=>{
 vi.useFakeTimers();try{
 const fetcher=(async(_url:any,init:any)=>{await new Promise<void>((resolve,reject)=>{setTimeout(resolve,55000);init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({stories:[]})}}],usage:{prompt_tokens:100,completion_tokens:20,cost:.001}}))}) as typeof fetch;
 const model=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,fetcher,'EDITORIAL')!;
 const pending=model.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},{});await vi.advanceTimersByTimeAsync(55000);expect((await pending).value).toEqual({stories:[]});
 const slow=createStrongSemanticModel({OPENROUTER_API_KEY:'test-only'} as Env,async(_url,init)=>new Promise((_resolve,reject)=>{(init?.signal as AbortSignal).addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))}),'EDITORIAL')!;
 const timeout=slow.complete('feed','COMPARATIVE_EDITORIAL_PLAN',{facts:[]},{});const checked=expect(timeout).rejects.toThrow('SEMANTIC_MODEL_TIMEOUT');await vi.advanceTimersByTimeAsync(60000);await checked;expect(slow.usage().reported).toBe(false);
 }finally{vi.useRealTimers()}
});
