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
import {durableSemanticOperation,SemanticValidationError} from './semantic-operations';
import {createStrongSemanticModel,type StrongSemanticModel} from './semantic-model';
import {extractClaimMentions,isNewsMention} from './claims';
import {parseConstruction,scopedConstructionWireSchema,constructionSchema} from './semantic-construction';
import type {SemanticConstruction,Entity,StorylineMemory} from './semantic-state';
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
 const entityMemory=await store.list<Entity>(job.feedId,'entities'),entityAnchors=entityMemory.filter(e=>e.aliases.some(a=>(revision.body??'').includes(a)));
 const priority=(c:EventMatchInput['candidates'][number])=>overlap(features(revision.body??'').keywords,features(c.version.state).keywords)+entityAnchors.filter(e=>e.aliases.some(a=>c.version.state.includes(a))).length;
 candidates.sort((a,b)=>priority(b)-priority(a)||b.newestAt.localeCompare(a.newestAt));
 const shortlist=candidates.slice(0,4),storylines:StorylineRecord[]=[];
 for(const root of await store.list<StorylineRecord>(job.feedId,'storylines')){const version=await store.read<import('./types').StorylineVersion>(job.feedId,'storyline_versions',root.currentVersionId);if(version?.eventVersionIds.length && version.eventVersionIds.every(id=>candidates.some(c=>c.version.id===id)))storylines.push(root)}
 storylines.splice(0,Math.max(0,storylines.length-4));
 const input:EventMatchInput={revision,role:classifyRole(revision.body??'').role,candidates:shortlist,storylineIds:storylines.map(s=>s.id)};
 const memory=await Promise.all(storylines.map(async s=>({id:s.id,version:await store.read<any>(job.feedId,'storyline_versions',s.currentVersionId),structured:await store.read<StorylineMemory>(job.feedId,'storyline_memories',s.currentVersionId)})));
 const state={source:{id:revision.id,text:(revision.body??revision.title??'').slice(0,2600)},events:shortlist.map(c=>({id:c.id,versionId:c.version.id,state:c.version.state.slice(0,500)})),storylines:memory.map(s=>({id:s.id,state:String(s.version?.currentState??'').slice(0,350)})),instruction:'Judge only supplied approved evidence. Separate bounded developments from ongoing Storylines. Preserve attributed conflicting claims and hedges. Structural identity is independent of epistemic effects. No external facts.'};
 const evidenceRevisionIds=[...new Set([revision.id,...shortlist.flatMap(c=>c.evidenceRevisionIds),...memory.flatMap(m=>members.filter(x=>m.version?.eventVersionIds.includes(x.eventVersionId)).map(x=>x.evidenceRevisionId))])],operation={feedId:job.feedId,feedRevision:feed.revision,evidenceRevisionIds,policyVersion:SEMANTIC_POLICY,budgetKey:`semantic:${now.slice(0,10)}`,state:{...state,attempt:options.attempt??0}};
 let decision:EventMatchDecision={structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'NO_ACCEPTED_JUDGMENT'}},reasons=['CONSTRUCTION'];
 if(shortlist.length && env.OPENROUTER_API_KEY){
  const client=new OpenRouterJudgmentClient({kind:'JEV',model:env.V1_JEV_SALIENCE_MODEL??'typesafe/jev-1.13',apiKey:env.OPENROUTER_API_KEY,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000,fetcher:options.fetcher});
  const criteria=Object.fromEntries([...shortlist.map((c,i)=>[`EVENT_${i}`,`Same bounded development as supplied Event ${c.id}`]),...storylines.map((s,i)=>[`STORY_${i}`,`Distinct new development in supplied Storyline ${s.id}`]),['NEW','New Storyline'],['DEFER','Uncertain relation']]);
  // Stage 1 decides structure only. Epistemic effect and entailment are meaningful only relative to the Event actually chosen.
  const saved=await durableSemanticOperation(store,{...operation,kind:'RELATION',model:client.model},async()=>{const result=await client.decide(state,{structure:{kind:'CHOICE',instructions:'Choose structural relation. Similar topic does not imply same development.',criteria}});return {value:result.answers,usage:result.usage}},now,()=>client.usage());
  const structure=saved.value?.structure;
  if(saved.status==='SUCCEEDED' && structure?.kind==='CHOICE'){
   const chosen=structure.choice,eventIndex=/^EVENT_(\d)$/.exec(chosen),storyIndex=/^STORY_(\d)$/.exec(chosen),target=eventIndex?shortlist[Number(eventIndex[1])]:undefined;
   let effectChoice:typeof effects[number]|undefined,checks:{forwardEntailment?:number;reverseEntailment?:number}={},material=false,entailmentReviewed=true;
   decision={structuralRelation:eventIndex?'SAME_EVENT':storyIndex?'NEW_EVENT_EXISTING_STORYLINE':chosen==='NEW'?'NEW_STORYLINE':'DEFER',eventId:target?.id,storylineId:storyIndex?storylines[Number(storyIndex[1])].id:undefined,epistemicEffects:[],confidence:structure.confidence,provenance:{scorer:'JEV',policyVersion:SEMANTIC_POLICY,judgmentId:saved.id}};
   if(target){
    // Stage 2 (cheap): effect, bilateral entailment and material novelty against the chosen Event only.
    const effectState={source:state.source,event:{id:target.id,versionId:target.version.id,state:target.version.state.slice(0,500)},instruction:state.instruction},effectClient=new OpenRouterJudgmentClient({kind:'JEV',model:client.model,apiKey:env.OPENROUTER_API_KEY,maxCalls:1,maxCostUsd:.02,maxCallCostUsd:.02,timeoutMs:10000,fetcher:options.fetcher});
    const second=await durableSemanticOperation(store,{...operation,kind:'RELATION_EFFECT',model:effectClient.model,state:{...effectState,attempt:options.attempt??0,structureJudgment:saved.id}},async()=>{const result=await effectClient.decide(effectState,{effect:{kind:'CHOICE',instructions:'Choose the most consequential epistemic effect of the source relative to the supplied Event.',criteria:Object.fromEntries(effects.map(e=>[e,e]))},forward:{kind:'BOOLEAN',instructions:'Does the supplied Event entail every factual detail and qualifier of source?'},reverse:{kind:'BOOLEAN',instructions:'Does source entail every factual detail and qualifier of the supplied Event?'},novelty:{kind:'SCORE',instructions:'Material new information, not wording novelty',levels:['none','small detail','material change','major consequence']}});return {value:result.answers,usage:result.usage}},now,()=>effectClient.usage());
    const a=second.value;
    if(second.status==='SUCCEEDED' && a?.effect?.kind==='CHOICE'){
     effectChoice=a.effect.choice as typeof effects[number];checks={forwardEntailment:a.forward?.kind==='BOOLEAN'?a.forward.probability:undefined,reverseEntailment:a.reverse?.kind==='BOOLEAN'?a.reverse.probability:undefined};material=a.novelty?.kind==='SCORE'&&a.novelty.value>=.5;
     entailmentReviewed=checks.forwardEntailment===undefined||checks.forwardEntailment<.9||checks.reverseEntailment===undefined||checks.reverseEntailment<.9;
     decision={...decision,epistemicEffects:[effectChoice],provenance:{...decision.provenance,judgmentId:`${saved.id}:${second.id}`}};
    }
   }
   reasons=escalationReasons(decision,checks);if(material)reasons.push('MATERIAL_NEW_INFORMATION');
   // Without a bilateral-entailment verdict for the chosen Event, identity is not established cheaply.
   if(!target||entailmentReviewed)reasons.push('ENTAILMENT_REVIEW');
  }
 }
 const strong=options.strong??createStrongSemanticModel(env,options.fetcher),extracted=await extractClaimMentions(revision),mentions=extracted.mentions.filter(isNewsMention);if(!mentions.length)return undefined;let construction:SemanticConstruction|undefined;
 // Truncated cheap inputs cannot establish whole-development entailment.
 if((revision.body??revision.title??'').length>2600||shortlist[0]?.version.state.length>500)reasons.push('TRUNCATED_ENTAILMENT_INPUT');
 if(reasons.length && strong && mentions.length<=32 && mentions.every(m=>m.sourceText.length<=1800)){
  const constructionState={...operation.state,prior:decision,reasons,knownEntities:entityMemory.slice(-20).map(e=>({entityId:e.entityId,canonicalLabel:e.canonicalLabel,aliases:e.aliases})),claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,reportingRoleHint:m.reportingRole,certainty:m.certainty,attribution:m.attribution})),memory:memory.map(m=>({id:m.id,versionId:m.version?.id,propositionIds:m.structured?.propositionIds,lifecycle:m.structured?.lifecycle})),instruction:state.instruction+' Group exact ClaimMention IDs into bounded developments; an article may contain multiple Events. Background labels cannot discard material quantities, attribution, negation or uncertainty. New developments may continue a supplied Storyline. Entities and multilingual aliases must be supported by supplied mention text; no external IDs required. Slots are optional, not required. Use slots=[] unless an exact source substring denotes a controlled attribute. role_holder means an office or role, never a paraphrased action, discovery or death. Never invent or paraphrase slot values/asOf text. Otherwise preserve the complete mention as a TEXT proposition; empty slots lose no facts. Return every mention in a group or background. Do not synthesize prose facts. Event IDs must come from offered events, never source.id (an evidence revision). SAME_EVENT requires an offered eventId. NEW_EVENT_EXISTING_STORYLINE requires an offered storylineId and eventId=null. NEW_STORYLINE and DEFER use eventId=null and storylineId=null. If no Storylines are offered, do not invent continuity.'};
  const saved=new TextEncoder().encode(JSON.stringify(constructionState)).length>48000?{id:'',status:'DEFERRED' as const,value:undefined,failure:'CONSTRUCTION_INPUT_LIMIT'}:await durableSemanticOperation(store,{...operation,kind:'SEMANTIC_CONSTRUCTION',model:strong.model,state:constructionState},async()=>{
   const result=await strong.complete(job.feedId,'SEMANTIC_CONSTRUCTION',constructionState,scopedConstructionWireSchema(mentions,input));
   let stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='OUTPUT_SCHEMA';
   try {const parsed=constructionSchema.parse(result.value);stage='CONSTRUCTION_BINDING';const value=parseConstruction(result.value,mentions,input,{scorer:'GPT',policyVersion:SEMANTIC_POLICY});return {value:{construction:value,confidence:parsed.confidence},usage:result.usage};}
   catch(error){throw new SemanticValidationError({stage,response:result.value,rejection:{name:error instanceof Error?error.name:'UNKNOWN',...(error instanceof Error&&'code' in error?{code:String(error.code)}:{}),...(error instanceof z.ZodError?{issues:error.issues.slice(0,12).map(issue=>({code:issue.code,path:issue.path}))}:{})}});}

  },now,()=>strong.usage());
  if(saved.status==='SUCCEEDED'&&saved.value && saved.value.confidence>=.6){construction={...saved.value.construction,provenance:{...saved.value.construction.provenance,judgmentId:saved.id}};const first=construction.groups[0];decision={structuralRelation:first.structuralRelation,eventId:first.eventId??undefined,storylineId:first.storylineId??undefined,epistemicEffects:[...new Set(construction.groups.flatMap(g=>g.epistemicEffects))],confidence:saved.value.confidence,provenance:construction.provenance}}
  else decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:saved.failure}};
 }else if(reasons.length)decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'STRONG_MODEL_UNAVAILABLE'}};
 const prepared:PreparedSemanticMatch={knownEventIds:candidates.map(c=>c.id),revisionId:revision.id,candidateVersions:Object.fromEntries(shortlist.map(c=>[c.id,c.version.id])),storylineVersions:Object.fromEntries(storylines.map(s=>[s.id,s.currentVersionId])),decision},matchers=preparedMatchers(prepared);
 if(construction)matchers.construction=current=>matchers.event.match(current).provenance.judgmentId===decision.provenance.judgmentId?structuredClone(construction):undefined;
 return {input,prepared,matchers};
}
