import {HandoffError} from '@distilled/contracts';
import {modelCapability} from './model-capacity';
import {durableSemanticOperation} from './semantic-operations';
import type {Env} from '../types';
import {DeterministicSalienceScorer,JevSalienceScorer,GptSalienceScorer,OpenRouterJudgmentClient,type EventSalienceScorer,SALIENCE_CRITERIA,salienceInstructions} from './salience';
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
 const port=(kind:'JEV'|'GPT',model:string):EventSalienceScorer=>({model,durablyAccounted:true,score:async input=>{
  const baseline=new DeterministicSalienceScorer().score(input);
  if(!await authorized(env,input))return {...baseline,fallback:'SALIENCE_SCOPE_REVOKED'};
  const store=new V1FeedStore(env.DB),versionIds=input.targetType==='EVENT'?[input.targetVersionId]:(await store.read<StorylineVersion>(input.feedId,'storyline_versions',input.targetVersionId))!.eventVersionIds;
  const evidenceRevisionIds=[...new Set((await store.list<EventMembership>(input.feedId,'memberships')).filter(m=>versionIds.includes(m.eventVersionId)).map(m=>m.evidenceRevisionId))];
  const client=new OpenRouterJudgmentClient({kind,model,apiKey:env.OPENROUTER_API_KEY!,durable:true,capability:modelCapability(model,env.V1_MODEL_CAPABILITIES_JSON),timeoutMs:10000,fetcher});
  const scorer=kind==='JEV'?new JevSalienceScorer(client):new GptSalienceScorer(client),questions={judgment:{kind:'CHOICE' as const,instructions:salienceInstructions(input),criteria:SALIENCE_CRITERIA}};
  try{const saved=await durableSemanticOperation(store,{feedId:input.feedId,feedRevision:input.feedRevision,evidenceRevisionIds,kind:'SALIENCE',policyVersion:'durable-account-salience-v1',model,budgetKey:'salience:'+input.targetVersionId,state:input},async()=>{const result=await scorer.score(input);return {value:result,usage:result.usage}},new Date().toISOString(),()=>client.usage(),{operationAdmission:client.admission(input,questions)});
  return saved.status==='SUCCEEDED'&&saved.value?saved.value:{...baseline,usage:saved.usage,fallback:saved.failure??'SALIENCE_PROCESSING_PENDING'};
  }catch(error){if(error instanceof HandoffError&&error.code==='SCOPE_DENIED')return {...baseline,usage:client.usage(),fallback:'SALIENCE_SCOPE_REVOKED'};throw error}
 }});
 return new SemanticSalienceRouter({jev:port('JEV',env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13'),gpt:port('GPT',env.V1_GPT_SALIENCE_MODEL??'openai/gpt-4.1-mini')});
}
