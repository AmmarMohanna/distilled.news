import type {Env} from '../types';
import {DeterministicSalienceScorer,JevSalienceScorer,GptSalienceScorer,OpenRouterJudgmentClient,type EventSalienceScorer} from './salience';
import {SemanticSalienceRouter} from './salience-router';
import {V1FeedStore} from './store';
import type {EventMembership,EventVersion} from '@distilled/contracts';
import type {EventRecord,StorylineRecord,StorylineVersion} from './types';
import type {SalienceInput} from './salience';
async function authorized(env:Env,input:SalienceInput):Promise<boolean>{
 try{
  if(env.V1_DOWNSTREAM_ENABLED!=='true')return false;
  const store=new V1FeedStore(env.DB),snapshot=await store.snapshot(input.feedId);
  if(snapshot.feed.revision!==input.feedRevision)return false;
  let versions:string[];
  if(input.targetType==='EVENT'){
   const version=await store.read<EventVersion>(input.feedId,'event_versions',input.targetVersionId);
   if(!version || (await store.read<EventRecord>(input.feedId,'events',version.eventId))?.currentVersionId!==version.id)return false;
   versions=[version.id];
  }else{
   const version=await store.read<StorylineVersion>(input.feedId,'storyline_versions',input.targetVersionId);
   if(!version || (await store.read<StorylineRecord>(input.feedId,'storylines',version.storylineId))?.currentVersionId!==version.id)return false;
   versions=version.eventVersionIds;
  }
  const members=(await store.list<EventMembership>(input.feedId,'memberships')).filter(m=>versions.includes(m.eventVersionId));
  if(!versions.length || versions.some(id=>!members.some(m=>m.eventVersionId===id)))return false;
  const active=await store.currentEvidence(input.feedId),switched=new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()));
  return members.every(m=>active.some(e=>e.revision.id===m.evidenceRevisionId&&switched.has(e.item.feedSourceId)));
 }catch{return false}
}
/** Bounded per-window routing on approved stored targets. Configuration chooses
 * providers; consumers depend only on the scorer port and assessment contract. */
export function createSemanticSalienceScorer(env:Env,fetcher:typeof fetch=fetch):EventSalienceScorer|undefined {
 if(env.V1_SALIENCE_POLICY==='DETERMINISTIC')return undefined;
 if(!env.OPENROUTER_API_KEY)return new SemanticSalienceRouter({});
 let calls=0,cost=0,unknown=false;const reservation=.02,maxCalls=20,maxCost=.1,deadline=Date.now()+60000;
 const port=(kind:'JEV'|'GPT',model:string):EventSalienceScorer=>({model,score:async input=>{
  if(!await authorized(env,input))return {...new DeterministicSalienceScorer().score(input),fallback:'SALIENCE_SCOPE_REVOKED'};
  if(unknown || calls>=maxCalls || cost+reservation>maxCost+1e-9 || Date.now()+10000>deadline)return {...new DeterministicSalienceScorer().score(input),fallback:unknown?'EXPERIMENT_OUTCOME_UNKNOWN':'EXPERIMENT_BUDGET_EXHAUSTED'};
  const client=new OpenRouterJudgmentClient({kind,model,apiKey:env.OPENROUTER_API_KEY!,maxCalls:1,maxCostUsd:reservation,maxCallCostUsd:reservation,timeoutMs:10000,fetcher});
  const result=await (kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client)).score(input);
  calls+=result.usage.calls;cost+=result.usage.costUsd;if(!result.usage.reported)unknown=true;
  return result;
 }});
 return new SemanticSalienceRouter({jev:port('JEV',env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13'),gpt:port('GPT',env.V1_GPT_SALIENCE_MODEL??'openai/gpt-4.1-mini')});
}
