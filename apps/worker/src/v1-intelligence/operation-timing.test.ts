import {expect,it,vi} from 'vitest';
import {ASYNC_MODEL_CALL_MS,ASYNC_JUDGMENT_CALL_MS,ASYNC_OPERATION_LEASE_MS,ASYNC_PROCESSING_SLICE_MS} from './operation-timing';
import {createStoredEvidenceModel} from './model';
import {createStrongSemanticModel} from './semantic-model';
import {ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {SEMANTIC_WORK_LEASE_MS} from './semantic-work-lease';
import type {Env} from '../types';
import {readFileSync} from 'node:fs';
const env={V1_SYNTHESIS_MODEL_ENABLED:'true',DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'fixture',V1_SEMANTIC_STRONG_MODEL:'openai/gpt-4.1-mini'} as Env;
it('staging queue batches cannot multiply asynchronous slices beyond one consumer invocation',()=>{
 const config=readFileSync(new URL('../../wrangler.staging.toml',import.meta.url),'utf8'),batch=Number(config.match(/max_batch_size\s*=\s*(\d+)/)?.[1]);
 expect(batch).toBeGreaterThan(0);
 expect(batch*(2*ASYNC_PROCESSING_SLICE_MS+120000)).toBeLessThan(15*60*1000);
});
it('continuation admits a full operation and leaves a durable settlement margin',()=>{
 expect(ASYNC_OPERATION_LEASE_MS-ASYNC_MODEL_CALL_MS).toBeGreaterThanOrEqual(60000);
 expect(SEMANTIC_WORK_LEASE_MS).toBe(ASYNC_OPERATION_LEASE_MS);
 expect(ASYNC_JUDGMENT_CALL_MS).toBeLessThan(ASYNC_OPERATION_LEASE_MS);
 expect(ADAPTIVE_BRIEFING_PROCESSING.maxWallClockMs).toBe(ASYNC_PROCESSING_SLICE_MS);
 expect(ASYNC_PROCESSING_SLICE_MS).toBeGreaterThan(ASYNC_MODEL_CALL_MS);
 expect(ASYNC_PROCESSING_SLICE_MS).toBeLessThan(15*60*1000);
});
it('a slow complete semantic response succeeds within asynchronous operation headroom',async()=>{
 vi.useFakeTimers();try{
  const model=createStrongSemanticModel(env,async()=>new Promise<Response>(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify({choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:100,completion_tokens:5,cost:.001}}))),135000)))!;
  const result=model.complete('f','SEMANTIC_CONSTRUCTION',{}, {type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});
  await vi.advanceTimersByTimeAsync(135000);expect((await result).value).toEqual({ok:true});expect(model.usage().reported).toBe(true);
 }finally{vi.useRealTimers()}
});
it('a stalled call remains financially unconfirmed; caller cancellation is still respected',async()=>{
 vi.useFakeTimers();try{
  const model=createStoredEvidenceModel(env,async(_,init)=>new Promise<Response>((_,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})))!;
  const writer={feed:{id:'f',revision:1,title:'Feed',interests:[],outputLanguage:'en'},selectionId:'s',stories:[]};
  const first=model.synthesize(writer,{maxOutputTokens:321,signal:new AbortController().signal}).then(()=> 'SUCCEEDED',e=>e.message);
  await vi.advanceTimersByTimeAsync(ASYNC_MODEL_CALL_MS);expect(await first).toBe('MODEL_TIMEOUT');expect(model.usage!().confirmed).toBe(false);
  const controller=new AbortController(),second=model.synthesize(writer,{maxOutputTokens:321,signal:controller.signal}).then(()=> 'SUCCEEDED',e=>e.message);
  controller.abort();expect(await second).toBe('MODEL_TIMEOUT');expect(model.usage!().confirmed).toBe(false);
 }finally{vi.useRealTimers()}
});
