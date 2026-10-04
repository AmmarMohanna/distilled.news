import {expect,it} from 'vitest';
import {DeterministicSalienceScorer,JevSalienceScorer,GptSalienceScorer,type SalienceInput,type JudgmentClient} from './salience';
import {SemanticSalienceRouter} from './salience-router';
import {cachedSalienceResult} from './salience-cache';
const input:SalienceInput={feedId:'feed',feedRevision:1,targetType:'EVENT',targetVersionId:'v1',text:'Parliament approved banking reform.',version:1,independentSupport:1,persistence:0,recency:1};
it('reads validated cached scorer output without treating editorial report columns as a provider failure',async()=>{
 const native={...new DeterministicSalienceScorer().score(input),provenance:{scorer:'JEV',model:'fixture',promptVersion:'fixture',policyVersion:'fixture'},targetVersionId:'v1',score:.75,latencyMs:123};
 const result=await new SemanticSalienceRouter({jev:{score:()=>cachedSalienceResult(native)}}).score(input);
 expect(result.route).toBe('NATIVE_JEV');expect(result.attempts[0].reason).toBeUndefined();
});
function client(kind:'JEV'|'GPT',confidence:number){let calls=0;const c:JudgmentClient={kind,model:`fixture-${kind}`,usage:()=>({calls,costUsd:calls*.001,reported:true}),choose:async()=>{calls++;return {choice:'HIGH',confidence,probabilities:{LOW:.05,MEDIUM:.05,HIGH:.85,CRITICAL:.05},usage:{calls:1,costUsd:.001,reported:true}}}};return c}
it('prefers native JEV and records confidence without calling GPT',async()=>{
 const jev=client('JEV',.9),gpt=client('GPT',.9),router=new SemanticSalienceRouter({jev:new JevSalienceScorer(jev),gpt:new GptSalienceScorer(gpt)});
 const result=await router.score(input);
 expect(result.provenance.scorer).toBe('JEV');expect(result.confidence).toBe(.9);expect(result.route).toBe('NATIVE_JEV');expect(gpt.usage().calls).toBe(0);
});
it('JEV uncertainty routes the identical input to GPT with transparent combined usage',async()=>{
 const jev=client('JEV',.4),gpt=client('GPT',.9),router=new SemanticSalienceRouter({jev:new JevSalienceScorer(jev),gpt:new GptSalienceScorer(gpt)});
 const result=await router.score(input);
 expect(result.route).toBe('GPT_FALLBACK');expect(result.provenance.scorer).toBe('GPT');expect(result.usage).toMatchObject({calls:2,costUsd:.002});expect(result.attempts[0].reason).toBe('EXPERIMENT_LOW_CONFIDENCE');expect(result.attempts[0].confidence).toBe(.4);
});
it('Storyline judgment uses GPT without assuming that JEV is validated for Storylines',async()=>{
 const jev=client('JEV',.9),gpt=client('GPT',.9),router=new SemanticSalienceRouter({jev:new JevSalienceScorer(jev),gpt:new GptSalienceScorer(gpt)});
 expect((await router.score({...input,targetType:'STORYLINE'})).route).toBe('NATIVE_GPT_STORYLINE');expect(jev.usage().calls).toBe(0);
});
it('uncertain or unavailable providers yield labeled deterministic fallback',async()=>{
 const result=await new SemanticSalienceRouter({jev:new JevSalienceScorer(client('JEV',.2)),gpt:new GptSalienceScorer(client('GPT',.3))}).score(input);
 expect(result.route).toBe('DETERMINISTIC_FALLBACK');expect(result.components).toEqual(new DeterministicSalienceScorer().score(input).components);expect(result.usage.calls).toBe(2);
 const offline=await new SemanticSalienceRouter({}).score(input);expect(offline.route).toBe('DETERMINISTIC_FALLBACK');expect(offline.usage.calls).toBe(0);
});
it('contains adapter exceptions as explicit fallback rather than failing the briefing',async()=>{
 const result=await new SemanticSalienceRouter({jev:{score:async()=>{throw Error('provider unavailable')}},gpt:new GptSalienceScorer(client('GPT',.9))}).score(input);
 expect(result.route).toBe('GPT_FALLBACK');expect(result.attempts[0].reason).toBe('ADAPTER_OUTCOME_UNKNOWN');expect(result.usage.reported).toBe(false);
});
