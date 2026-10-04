import {z} from 'zod';
import type {EventVersion,EventMembership} from '@distilled/contracts';
import type {Env} from '../types';
import {V1IntakeStore} from '../v1-intake/store';
import type {DownstreamJob} from '../v1-intake/types';
import {V1FeedStore} from './store';
import {classifyRole,features,overlap} from './policies';
import type {EventRecord,StorylineRecord} from './types';
import {type EventMatchDecision,type EventMatchInput,validateEventMatch} from './matchers';
import {SEMANTIC_POLICY,escalationReasons,preparedMatchers,type PreparedSemanticMatch} from './semantic-routing';
import {OpenRouterJudgmentClient} from './salience';
import {durableSemanticOperation} from './semantic-operations';
import {createStrongSemanticModel,type StrongSemanticModel} from './semantic-model';
const effects=['CORROBORATES','ADDS_DETAIL','CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'] as const;
const decisionSchema=z.object({structuralRelation:z.enum(['SAME_EVENT','NEW_EVENT_EXISTING_STORYLINE','NEW_STORYLINE','DEFER']),eventId:z.string().nullable(),storylineId:z.string().nullable(),epistemicEffects:z.array(z.enum(effects)).max(7),confidence:z.number().min(0).max(1)}).strict();
export const relationWireSchema={type:'object',additionalProperties:false,required:['structuralRelation','eventId','storylineId','epistemicEffects','confidence'],properties:{structuralRelation:{type:'string',enum:['SAME_EVENT','NEW_EVENT_EXISTING_STORYLINE','NEW_STORYLINE','DEFER']},eventId:{type:['string','null']},storylineId:{type:['string','null']},epistemicEffects:{type:'array',maxItems:7,items:{type:'string',enum:effects}},confidence:{type:'number',minimum:0,maximum:1}}};
export interface SemanticPreparation {input:EventMatchInput;prepared:PreparedSemanticMatch;matchers:ReturnType<typeof preparedMatchers>}
/** Bounded retrieval retains current Events regardless of publication age.
 * Lexical overlap is retrieval priority only, never the semantic relation. */
export async function prepareSemanticMatch(store:V1FeedStore,env:Env,jobId:string,now:string,options:{fetcher?:typeof fetch;strong?:StrongSemanticModel;attempt?:number}={}):Promise<SemanticPreparation|undefined> {
 if(env.V1_SEMANTIC_POLICY==='DETERMINISTIC'||!env.OPENROUTER_API_KEY && !options.strong)return undefined;
 const job=(await new V1IntakeStore(store.db).read<DownstreamJob>('jobs',jobId))?.value;if(!job)return undefined;
 const feed=await store.getFeed(job.feedId),active=await store.currentEvidence(job.feedId),revision=active.find(e=>e.revision.sourceObservationId===job.observationId)?.revision;if(!feed||!revision)return undefined;
 const members=await store.list<EventMembership>(job.feedId,'memberships'),candidates:EventMatchInput['candidates']=[],activeIds=new Set(active.map(e=>e.revision.id));
 for(const root of await store.list<EventRecord>(job.feedId,'events')){
  const version=await store.read<EventVersion>(job.feedId,'event_versions',root.currentVersionId),support=members.filter(m=>m.eventVersionId===root.currentVersionId).map(m=>m.evidenceRevisionId);
  if(!version||version.type==='WITHDRAWN'||!support.length||support.some(id=>!activeIds.has(id)))continue;
  candidates.push({id:root.id,version,evidenceRevisionIds:support,newestAt:version.createdAt});
 }
 candidates.sort((a,b)=>overlap(features(revision.body??'').keywords,features(b.version.state).keywords)-overlap(features(revision.body??'').keywords,features(a.version.state).keywords)||b.newestAt.localeCompare(a.newestAt));
 const shortlist=candidates.slice(0,4),storylines=(await store.list<StorylineRecord>(job.feedId,'storylines')).slice(-4);
 const input:EventMatchInput={revision,role:classifyRole(revision.body??'').role,candidates:shortlist,storylineIds:storylines.map(s=>s.id)};
 const memory=await Promise.all(storylines.map(async s=>({id:s.id,version:await store.read<any>(job.feedId,'storyline_versions',s.currentVersionId)})));
 const state={source:{id:revision.id,text:(revision.body??revision.title??'').slice(0,2600)},events:shortlist.map(c=>({id:c.id,versionId:c.version.id,state:c.version.state.slice(0,500)})),storylines:memory.map(s=>({id:s.id,state:String(s.version?.currentState??'').slice(0,350)})),instruction:'Judge only supplied approved evidence. Separate bounded developments from ongoing Storylines. Preserve attributed conflicting claims and hedges. Structural identity is independent of epistemic effects. No external facts.'};
 const evidenceRevisionIds=[...new Set([revision.id,...shortlist.flatMap(c=>c.evidenceRevisionIds)])],operation={feedId:job.feedId,feedRevision:feed.revision,evidenceRevisionIds,policyVersion:SEMANTIC_POLICY,budgetKey:`semantic:${now.slice(0,10)}`,state:{...state,attempt:options.attempt??0}};
 let decision:EventMatchDecision={structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'NO_ACCEPTED_JUDGMENT'}},reasons=['CONSTRUCTION'];
 if(shortlist.length && env.OPENROUTER_API_KEY){
  const client=new OpenRouterJudgmentClient({kind:'JEV',model:env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13',apiKey:env.OPENROUTER_API_KEY,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000,fetcher:options.fetcher});
  const criteria=Object.fromEntries([...shortlist.map((c,i)=>[`EVENT_${i}`,`Same bounded development as supplied Event ${c.id}`]),...storylines.map((s,i)=>[`STORY_${i}`,`Distinct new development in supplied Storyline ${s.id}`]),['NEW','New Storyline'],['DEFER','Uncertain relation']]);
  const saved=await durableSemanticOperation(store,{...operation,kind:'RELATION',model:client.model},async()=>{const result=await client.decide(state,{structure:{kind:'CHOICE',instructions:'Choose structural relation. Similar topic does not imply same development.',criteria},effect:{kind:'CHOICE',instructions:'Choose the most consequential epistemic effect relative to supplied Event 0.',criteria:Object.fromEntries(effects.map(e=>[e,e]))},forward:{kind:'BOOLEAN',instructions:'Does supplied Event 0 entail every factual detail and qualifier of source?'},reverse:{kind:'BOOLEAN',instructions:'Does source entail every factual detail and qualifier of Event 0?'},novelty:{kind:'SCORE',instructions:'Material new information, not wording novelty',levels:['none','small detail','material change','major consequence']},priority:{kind:'SCORE',instructions:'Priority for editorial examination, not final story selection',levels:['low','ordinary','protected material change']}});return {value:result.answers,usage:result.usage}},now,()=>client.usage());
  const a=saved.value,structure=a?.structure,effect=a?.effect;
  if(saved.status==='SUCCEEDED' && structure?.kind==='CHOICE' && effect?.kind==='CHOICE'){
   const chosen=structure.choice,eventIndex=/^EVENT_(\d)$/.exec(chosen),storyIndex=/^STORY_(\d)$/.exec(chosen);
   decision={structuralRelation:eventIndex?'SAME_EVENT':storyIndex?'NEW_EVENT_EXISTING_STORYLINE':chosen==='NEW'?'NEW_STORYLINE':'DEFER',eventId:eventIndex?shortlist[Number(eventIndex[1])].id:undefined,storylineId:storyIndex?storylines[Number(storyIndex[1])].id:undefined,epistemicEffects:[effect.choice as typeof effects[number]],confidence:structure.confidence,provenance:{scorer:'JEV',policyVersion:SEMANTIC_POLICY,judgmentId:saved.id}};
   const checks={forwardEntailment:a?.forward?.kind==='BOOLEAN'?a.forward.probability:undefined,reverseEntailment:a?.reverse?.kind==='BOOLEAN'?a.reverse.probability:undefined};reasons=escalationReasons(decision,checks);
   if(!eventIndex || Number(eventIndex[1])!==0 || checks.forwardEntailment===undefined || checks.forwardEntailment<.9 || checks.reverseEntailment===undefined || checks.reverseEntailment<.9)reasons.push('ENTAILMENT_REVIEW');
  }
 }
 const strong=options.strong??createStrongSemanticModel(env,options.fetcher);
 if(reasons.length && strong){
  const saved=await durableSemanticOperation(store,{...operation,kind:'RELATION_ESCALATION',model:strong.model,state:{...operation.state,prior:decision,reasons}},async()=>{
   const result=await strong.complete(job.feedId,'SEMANTIC_RELATION',{...state,reasons,prior:decision},relationWireSchema),parsed=decisionSchema.parse(result.value);
   return {value:validateEventMatch({...parsed,eventId:parsed.eventId??undefined,storylineId:parsed.storylineId??undefined,provenance:{scorer:'GPT',policyVersion:SEMANTIC_POLICY}},input),usage:result.usage};
  },now,()=>strong.usage());
  if(saved.status==='SUCCEEDED'&&saved.value && saved.value.confidence>=.6)decision={...saved.value,provenance:{...saved.value.provenance,judgmentId:saved.id}};
  else decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:saved.failure}};
 }else if(reasons.length)decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'STRONG_MODEL_UNAVAILABLE'}};
 const prepared:PreparedSemanticMatch={revisionId:revision.id,candidateVersions:Object.fromEntries(shortlist.map(c=>[c.id,c.version.id])),decision};return {input,prepared,matchers:preparedMatchers(prepared)};
}
