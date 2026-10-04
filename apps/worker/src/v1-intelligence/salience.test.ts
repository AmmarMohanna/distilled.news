import {expect,it,vi} from 'vitest';
import {DeterministicSalienceScorer,JevSalienceScorer,GptSalienceScorer,OpenRouterJudgmentClient,type SalienceInput} from './salience';
const input:SalienceInput={feedId:'feed',feedRevision:1,targetType:'EVENT',targetVersionId:'event-v1',text:'Lebanon Parliament approved banking reform.',version:1,independentSupport:2,persistence:0,recency:.8};
it('keeps deterministic salience independent of selection, relevance and a provider',async()=>{
 const result=await new DeterministicSalienceScorer().score(input);
 expect(result.components).toMatchObject({novelty:1,corroboration:.666667,recency:.8});expect(result.usage).toMatchObject({calls:0,costUsd:0});
 expect(result.provenance.scorer).toBe('DETERMINISTIC');
});
it.each(['JEV','GPT'] as const)('executes the optional %s scorer on the identical bounded input',async kind=>{
 let payload:any,calls=0;
 const client=new OpenRouterJudgmentClient({kind,apiKey:'synthetic',model:'fixture-model',maxCalls:1,maxCostUsd:.04,maxCallCostUsd:.04,fetcher:async(_url,options)=>{
  calls++;payload=JSON.parse(String(options?.body));const answer={type:'choice',choice:'HIGH',confidence:.9,probabilities:{LOW:.05,MEDIUM:.05,HIGH:.85,CRITICAL:.05}};
  return Response.json(kind==='JEV'?{answers:{judgment:answer},usage:{input_tokens:100,output_tokens:10,cost:.001}}:{choices:[{message:{content:JSON.stringify(answer)}}],usage:{prompt_tokens:100,completion_tokens:10,cost:.001}});
 }});
 const scorer=kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client);
 const result=await scorer.score(input);expect(result.components.overallScore).toBe(.75);expect(result.usage.costUsd).toBe(.001);expect(calls).toBe(1);
 expect(JSON.stringify(payload)).toContain('event-v1');expect(JSON.stringify(payload)).not.toContain('synthetic');
 const replay=await scorer.score(input);expect(replay.fallback).toBe('EXPERIMENT_BUDGET_EXHAUSTED');expect(calls).toBe(1);
});
it('malformed optional judgment falls back without retry or invented reported usage',async()=>{
 let calls=0;const client=new OpenRouterJudgmentClient({kind:'JEV',apiKey:'synthetic',model:'fixture',maxCalls:1,maxCostUsd:.04,maxCallCostUsd:.04,fetcher:async()=>{calls++;return Response.json({answers:{judgment:{choice:'HIGH'}}})}});
 const result=await new JevSalienceScorer(client).score(input);expect(result.fallback).toBe('INVALID_EXPERIMENT_RESULT');expect(result.provenance.scorer).toBe('DETERMINISTIC');expect(result.usage.reported).toBe(false);expect(result.usage.costUsd).toBe(.04);expect(calls).toBe(1);
});
it('records reported cost overruns and stops further calls even when the answer is malformed',async()=>{
 let calls=0;const client=new OpenRouterJudgmentClient({kind:'JEV',apiKey:'synthetic',model:'fixture',maxCalls:10,maxCostUsd:.1,maxCallCostUsd:.01,fetcher:async()=>{calls++;return Response.json({answers:{judgment:{choice:'HIGH'}},usage:{input_tokens:100,output_tokens:10,cost:.08}})}});
 const scorer=new JevSalienceScorer(client),result=await scorer.score(input);
 expect(client.usage()).toMatchObject({calls:1,costUsd:.08,reported:true});expect(result.usage.costUsd).toBe(.08);
 await scorer.score(input);expect(calls).toBe(1);
});
it('retains an unknown reservation after timeout and ignores a late provider result',async()=>{
 vi.useFakeTimers();try {
  let calls=0;const client=new OpenRouterJudgmentClient({kind:'JEV',apiKey:'synthetic',model:'fixture',maxCalls:2,maxCostUsd:.08,maxCallCostUsd:.04,timeoutMs:10,fetcher:async()=>{
   calls++;await new Promise(resolve=>setTimeout(resolve,100));return Response.json({answers:{judgment:{type:'choice',choice:'HIGH',confidence:.9,probabilities:{LOW:0,MEDIUM:0,HIGH:1,CRITICAL:0}}},usage:{cost:.001}});
  }});
  const scorer=new JevSalienceScorer(client),pending=scorer.score(input);await vi.advanceTimersByTimeAsync(10);
  expect((await pending).fallback).toBe('EXPERIMENT_TIMEOUT');await vi.advanceTimersByTimeAsync(100);
  expect(client.usage()).toMatchObject({calls:1,costUsd:.04,reported:false});expect((await scorer.score(input)).fallback).toBe('EXPERIMENT_OUTCOME_UNKNOWN');expect(calls).toBe(1);
 }finally {vi.useRealTimers()}
});
