import {indexSourcePassages} from './source-passages';
import {identityReviewRequest,applyIdentityReview,IDENTITY_REVIEW_POLICY} from './event-identity-review';
import {llmRoute,configuredProviderLimits} from './provider-routing';
import {inferenceConcurrency} from './parallel-inference';
import {ASYNC_JUDGMENT_CALL_MS} from './operation-timing';
import {constructionTransport,PACKET_CONSTRUCTION_VERSION,ARTICLE_FIRST_POLICY,MINIMAL_CONSTRUCTION_INSTRUCTION,isDispositionVersion} from './construction-transport';
import {repairSemanticConstruction} from './semantic-construction-repair';
import {continueSemanticConstruction} from './semantic-continuation';
import {modelCapability} from './model-capacity';
import type {ModelAdmission} from './model-capacity';
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
import {durableSemanticOperation,SemanticValidationError,SemanticContentionError,type BudgetLane,type SemanticOperationInput,type SemanticOperationResult} from './semantic-operations';
import {countLatency,measureLatency} from './latency';
import {protectedRematchRevisionIds} from './rematch';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {ExperimentUsage} from './salience';
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
 const preparationStarted=Date.now();
 if(env.V1_SEMANTIC_POLICY==='DETERMINISTIC')return undefined;
 const job=(await new V1IntakeStore(store.db).read<DownstreamJob>('jobs',jobId))?.value;if(!job)return undefined;
 const snapshot=await store.snapshot(job.feedId),feed=snapshot.feed,active=await measureLatency('EVIDENCE_LOAD',()=>store.currentEvidence(job.feedId)),revision=active.find(e=>e.revision.sourceObservationId===job.observationId)?.revision;if(!revision)return undefined;
 // V2 exposes the complete source; eligibility is a semantic decision.
 const articleFirst=env.V1_PUBLICATION_VALIDATION_CONTRACT==='EVIDENCE_GROUNDED_V2';
 const extracted=await measureLatency('SOURCE_INDEX',()=>articleFirst?indexSourcePassages(revision):extractClaimMentions(revision));if(!extracted.mentions.length||!articleFirst&&!extracted.mentions.some(isNewsMention))return undefined;
 countLatency('activeEvidence',active.length);countLatency('claimMentions',extracted.mentions.length);
 const members=await store.list<EventMembership>(job.feedId,'memberships'),candidates:EventMatchInput['candidates']=[],activeIds=new Set(active.map(e=>e.revision.id)),knownEventVersions:Record<string,string>={};
 const roots=await store.list<EventRecord>(job.feedId,'events'),eventIds=roots.map(r=>r.currentVersionId);
 const [versions,semanticStates]=await Promise.all([store.readMany<EventVersion>(job.feedId,'event_versions',eventIds),store.readMany<import('./semantic-state').EventSemanticState>(job.feedId,'event_semantic_states',eventIds)]);
 const supportByVersion=new Map<string,string[]>();for(const member of members){const support=supportByVersion.get(member.eventVersionId)??[];support.push(member.evidenceRevisionId);supportByVersion.set(member.eventVersionId,support)}
 for(const root of roots){
  const version=versions.get(root.currentVersionId),support=supportByVersion.get(root.currentVersionId)??[];
  if(!version||version.type==='WITHDRAWN')continue;
  // Catalog the same non-withdrawn universe consumed by the engine, including
  // unavailable roots. Only active supports can be offered to the model.
  knownEventVersions[root.id]=version.id;
  if(!support.length||support.some(id=>!activeIds.has(id)))continue;
  // A provisional representation is not independent confirmation of itself.
  // It remains catalogued for consumption fencing, but needs construction.
  const semantic=semanticStates.get(version.id);
  if(semantic?.provisional&&support.every(id=>id===revision.id))continue;
  candidates.push({id:root.id,version,evidenceRevisionIds:support,newestAt:version.createdAt});
 }
 const sourceText=[revision.title,revision.body].filter(Boolean).join('\n'),entityMemory=await store.list<Entity>(job.feedId,'entities'),entityAnchors=entityMemory.filter(e=>e.aliases.some(a=>sourceText.includes(a)));
 const sourceFeatures=features(sourceText),priorities=new Map(candidates.map(c=>[c.id,overlap(sourceFeatures.keywords,features(c.version.state).keywords)+entityAnchors.filter(e=>e.aliases.some(a=>c.version.state.includes(a))).length]));
 candidates.sort((a,b)=>priorities.get(b.id)!-priorities.get(a.id)!||b.newestAt.localeCompare(a.newestAt));
 const shortlist=candidates,storylines:StorylineRecord[]=[];
 const storylineRoots=await store.list<StorylineRecord>(job.feedId,'storylines'),storylineVersionIds=storylineRoots.map(r=>r.currentVersionId);
 const [storylineVersions,storylineMemories]=await Promise.all([store.readMany<import('./types').StorylineVersion>(job.feedId,'storyline_versions',storylineVersionIds),store.readMany<StorylineMemory>(job.feedId,'storyline_memories',storylineVersionIds)]);
 const candidateVersionIds=new Set(candidates.map(c=>c.version.id));
 for(const root of storylineRoots){const version=storylineVersions.get(root.currentVersionId);if(version?.eventVersionIds.length && version.eventVersionIds.every(id=>candidateVersionIds.has(id)))storylines.push(root)}

 // All context reads must have observed one canonical Feed/scope epoch. A
 // mixed snapshot is a capacity retry, not a semantic failure or a paid call.
 const validated=await store.snapshot(job.feedId);
 if(snapshot.epoch!==validated.epoch||canonicalJson(snapshot.scopes)!==canonicalJson(validated.scopes))throw new SemanticContentionError();
 const input:EventMatchInput={feedRevision:feed.revision,activeEvidenceRevisionIds:active.map(e=>e.revision.id),revision,role:articleFirst?'REPORTED_DEVELOPMENT':classifyRole(sourceText).role,candidates:shortlist,storylineIds:storylines.map(s=>s.id)};
 const memory=storylines.map(s=>({id:s.id,version:storylineVersions.get(s.currentVersionId),structured:storylineMemories.get(s.currentVersionId)}));
 console.info(JSON.stringify({type:'V1_SEMANTIC_PREPARATION_CONTEXT',feedId:job.feedId,jobId,durationMs:Date.now()-preparationStarted,eventRoots:roots.length,storylineRoots:storylineRoots.length,offeredEvents:candidates.length,offeredStorylines:storylines.length,contextBatchQueries:2*Math.ceil(new Set(eventIds).size/90)+2*Math.ceil(new Set(storylineVersionIds).size/90),leaseRemainingMs:store.semanticLease?store.semanticLease.leaseUntil-Date.now():undefined}));
 const state={source:{...Object.fromEntries(Object.entries(revision).filter(([key])=>key!=='body')),text:revision.body??''},events:shortlist.map(c=>({id:c.id,versionId:c.version.id,state:c.version.state})),storylines:memory.map(s=>({id:s.id,state:String(s.version?.currentState??'')})),instruction:'Judge only supplied approved evidence. Separate bounded developments from ongoing Storylines. Preserve attributed conflicting claims and hedges. Structural identity is independent of epistemic effects. No external facts.'};
 const evidenceRevisionIds=[...new Set([revision.id,...shortlist.flatMap(c=>c.evidenceRevisionIds),...memory.flatMap(m=>(m.version?.eventVersionIds??[]).flatMap(id=>supportByVersion.get(id)??[]))])],operation={feedId:job.feedId,feedRevision:feed.revision,evidenceRevisionIds,policyVersion:SEMANTIC_POLICY,budgetKey:`semantic:${now.slice(0,10)}`,state:{...state,attempt:options.attempt??0}};
 const reuseContext={eventVersions:Object.fromEntries(shortlist.map(c=>[c.id,c.version.id])),storylineVersions:Object.fromEntries(storylines.map(s=>[s.id,s.currentVersionId])),extractorVersion:extracted.document.extractorVersion,extractionPolicy:extracted.document.extractionPolicyVersion};
 // Retries re-run only what has not already been answered: a stage whose identical input already SUCCEEDED under an earlier attempt is read back (no call,
 // no allowance spent). Known failed stages retain bounded retries; unknown outcomes are fenced across attempts and days. Changed semantic context cannot reuse success.
 const attemptNo=options.attempt??0,protectedRevisions=await protectedRematchRevisionIds(store,job.feedId),lane:BudgetLane=protectedRevisions.has(revision.id)?'PROTECTED':attemptNo>0?'RETRY':'PRIMARY';
 const staged=async<T>(build:(attempt:number)=>SemanticOperationInput,run:()=>Promise<{value:T;usage:ExperimentUsage}>,usage:()=>ExperimentUsage,operationAdmission?:ModelAdmission):Promise<SemanticOperationResult<T>>=>{
  for(let k=attemptNo-1;k>=0;k--){const input=build(k),prior=await store.read<SemanticOperationResult<T>>(job.feedId,'semantic_results',await sha256(canonicalJson(input)));if(prior?.status==='SUCCEEDED'||prior?.input.kind==='SEMANTIC_CONSTRUCTION'&&prior?.status==='DEFERRED'&&prior.usage.reported&&prior.usage.calls===1&&['SEMANTIC_CONSTRUCTION_REJECTED','SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED'].includes(prior.failure??''))return durableSemanticOperation(store,input,run,now,usage,{lane,reuseContext,operationAdmission})}
  return durableSemanticOperation(store,build(attemptNo),run,now,usage,{lane,reuseContext,operationAdmission});
 };
 let decision:EventMatchDecision={structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'NO_ACCEPTED_JUDGMENT'}},reasons=['CONSTRUCTION'];
 if(!articleFirst && shortlist.length && shortlist.length+storylines.length+2<=255 && env.OPENROUTER_API_KEY&&llmRoute(env,'relation').provider==='openrouter'&&llmRoute(env,'novelty').provider==='openrouter'&&modelCapability(llmRoute(env,'relation').model,env.V1_MODEL_CAPABILITIES_JSON)?.transport==='DECISIONS'&&modelCapability(llmRoute(env,'novelty').model,env.V1_MODEL_CAPABILITIES_JSON)?.transport==='DECISIONS'){
  const client=new OpenRouterJudgmentClient({kind:'JEV',model:llmRoute(env,'relation').model,apiKey:env.OPENROUTER_API_KEY,durable:true,providerLimits:configuredProviderLimits(env,'openrouter'),capability:modelCapability(llmRoute(env,'relation').model,env.V1_MODEL_CAPABILITIES_JSON),timeoutMs:ASYNC_JUDGMENT_CALL_MS,fetcher:options.fetcher});
  const criteria=Object.fromEntries([...shortlist.map((c,i)=>[`EVENT_${i}`,`Same bounded development as supplied Event ${c.id}`]),...storylines.map((s,i)=>[`STORY_${i}`,`Distinct new development in supplied Storyline ${s.id}`]),['NEW','New Storyline'],['DEFER','Uncertain relation']]);
  // Stage 1 decides structure only. Epistemic effect and entailment are meaningful only relative to the Event actually chosen.
  const saved=await staged(a=>({...operation,kind:'RELATION',model:client.model,state:{...state,attempt:a}}),async()=>{const result=await client.decide(state,{structure:{kind:'CHOICE',instructions:'Choose structural relation. Similar topic does not imply same development.',criteria}});return {value:result.answers,usage:result.usage}},()=>client.usage(),client.admission(state,{structure:{kind:'CHOICE',instructions:'Choose structural relation. Similar topic does not imply same development.',criteria}}));
  const structure=saved.value?.structure;
  if(saved.status==='SUCCEEDED' && structure?.kind==='CHOICE'){
   const chosen=structure.choice,eventIndex=/^EVENT_(\d+)$/.exec(chosen),storyIndex=/^STORY_(\d+)$/.exec(chosen),target=eventIndex?shortlist[Number(eventIndex[1])]:undefined;
   let effectChoice:typeof effects[number]|undefined,checks:{forwardEntailment?:number;reverseEntailment?:number}={},material=false,entailmentReviewed=true;
   decision={structuralRelation:eventIndex?'SAME_EVENT':storyIndex?'NEW_EVENT_EXISTING_STORYLINE':chosen==='NEW'?'NEW_STORYLINE':'DEFER',eventId:target?.id,storylineId:storyIndex?storylines[Number(storyIndex[1])].id:undefined,epistemicEffects:[],confidence:structure.confidence,provenance:{scorer:'JEV',policyVersion:SEMANTIC_POLICY,judgmentId:saved.id}};
   if(target){
    // Stage 2 (cheap): effect, bilateral entailment and material novelty against the chosen Event only.
    const effectState={source:state.source,event:{id:target.id,versionId:target.version.id,state:target.version.state},instruction:state.instruction},effectClient=new OpenRouterJudgmentClient({kind:'JEV',model:llmRoute(env,'novelty').model,apiKey:env.OPENROUTER_API_KEY,durable:true,providerLimits:configuredProviderLimits(env,'openrouter'),capability:modelCapability(llmRoute(env,'novelty').model,env.V1_MODEL_CAPABILITIES_JSON),timeoutMs:ASYNC_JUDGMENT_CALL_MS,fetcher:options.fetcher});
    const effectQuestions:Record<string,import('./semantic-provider').SemanticQuestion>={effect:{kind:'CHOICE',instructions:'Choose the most consequential epistemic effect of the source relative to the supplied Event.',criteria:Object.fromEntries(effects.map(e=>[e,e]))},forward:{kind:'BOOLEAN',instructions:'Does the supplied Event entail every factual detail and qualifier of source?'},reverse:{kind:'BOOLEAN',instructions:'Does source entail every factual detail and qualifier of the supplied Event?'},novelty:{kind:'SCORE',instructions:'Material new information, not wording novelty',levels:['none','small detail','material change','major consequence']}};
    const second=await staged(a=>({...operation,kind:'RELATION_EFFECT',model:effectClient.model,state:{...effectState,attempt:a,structureJudgment:saved.id}}),async()=>{const result=await effectClient.decide(effectState,effectQuestions);return {value:result.answers,usage:result.usage}},()=>effectClient.usage(),effectClient.admission(effectState,effectQuestions));
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
 if(env.V1_PUBLICATION_VALIDATION_CONTRACT==='EVIDENCE_GROUNDED_V2'&&!reasons.length)reasons.push('ARTICLE_OCCURRENCE_CONSTRUCTION');
 const strong=options.strong??createStrongSemanticModel(env,options.fetcher),mentions=articleFirst?extracted.mentions:extracted.mentions.filter(isNewsMention);let construction:SemanticConstruction|undefined;
 if(reasons.length && strong && mentions.length){
  const constructionState={...operation.state,...(env.V1_PUBLICATION_VALIDATION_CONTRACT==='EVIDENCE_GROUNDED_V2'?{constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION,articleUnderstandingPolicy:ARTICLE_FIRST_POLICY}:{}),prior:decision,reasons,knownEntities:entityMemory.map(e=>({entityId:e.entityId,canonicalLabel:e.canonicalLabel,aliases:e.aliases})),claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,sourceField:m.span.field,...(!articleFirst?{reportingRoleHint:m.reportingRole,certainty:m.certainty,attribution:m.attribution}:{})})),memory:memory.map(m=>({id:m.id,versionId:m.version?.id,propositionIds:m.structured?.propositionIds,lifecycle:m.structured?.lifecycle})),instruction:env.V1_PUBLICATION_VALIDATION_CONTRACT==='EVIDENCE_GROUNDED_V2'?MINIMAL_CONSTRUCTION_INSTRUCTION+' SAME_EVENT means the same bounded real-world occurrence, not a shared actor, industry, vocabulary or topic. Identify actor, action, object and temporal scope. Supporting details about one occurrence stay together; independent announcements, partnerships, financing and revenue updates require separate developments unless the source establishes they are one occurrence. A prior event mentioning a company does not own every later event about that company. NEW_EVENT_EXISTING_STORYLINE requires a supported continuing narrative, not shared AI/safety vocabulary.':state.instruction+' Group exact ClaimMention IDs into bounded developments; an article may contain multiple Events. A supported assertive TITLE is evidence, even when BODY is weak. Title and body paraphrases of the same fact share a development. Nonassertive names, questions, teasers and promotion are not news facts; ambiguous wording needs semantic judgment and may remain background, never invented into an assertion. Background labels cannot discard material quantities, attribution, negation or uncertainty. New developments may continue a supplied Storyline. Entities and multilingual aliases must be supported by supplied mention text; no external IDs required. Slots are optional, not required. Use slots=[] unless an exact source substring denotes a controlled attribute. role_holder means an office or role, never a paraphrased action, discovery or death. Never invent or paraphrase slot values/asOf text. Otherwise preserve the complete mention as a TEXT proposition; empty slots lose no facts. Return every mention in a group or background. Do not synthesize prose facts. Event IDs must come from offered events, never source.id (an evidence revision). SAME_EVENT requires an offered eventId. NEW_EVENT_EXISTING_STORYLINE requires an offered storylineId and eventId=null. NEW_STORYLINE and DEFER use eventId=null and storylineId=null. If no Storylines are offered, do not invent continuity.'};
  // Wire aliases are lossless execution encoding. Policy and instruction stay
  // in the paid question: only compatible successes reuse; UNKNOWN fences remain.
  const transport=constructionTransport(mentions,input,constructionState);
  let saved=await staged(a=>({...operation,kind:'SEMANTIC_CONSTRUCTION',model:strong.model,state:{...constructionState,attempt:a}}),async()=>{
   const result=await strong.complete(job.feedId,'SEMANTIC_CONSTRUCTION',transport.state,transport.schema);
   let stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING'='OUTPUT_SCHEMA',diagnosticResponse=result.value;
   try {if(!('constructionOwnershipVersion' in constructionState))constructionSchema.parse(result.value);stage='CONSTRUCTION_BINDING';diagnosticResponse=transport.decode(result.value);const parsed=constructionSchema.parse(diagnosticResponse);const value=parseConstruction(diagnosticResponse,mentions,input,{scorer:'GPT',policyVersion:SEMANTIC_POLICY});return {value:{construction:value,confidence:parsed.confidence,...(isDispositionVersion(constructionState.constructionOwnershipVersion)?{...transport.audit(result.value),rawResponse:result.rawResponse}: {})},usage:result.usage};}
   catch(error){throw new SemanticValidationError({stage,response:result.value,...(result.rawResponse?{rawResponse:result.rawResponse}:{}),rejection:{name:error instanceof Error?error.name:'UNKNOWN',...(error instanceof Error&&'mechanicalIssues' in error?{mechanicalIssues:error.mechanicalIssues as import('./construction-diagnostics').ConstructionIssue[]}:{}),...(error instanceof Error&&'binding' in error?{binding:error.binding as {invariant:string;path:(string|number)[]}}:{}),...(error instanceof Error&&'code' in error?{code:String(error.code)}:{}),...(error instanceof z.ZodError?{issues:error.issues.slice(0,12).map(issue=>({code:issue.code,path:issue.path}))}:{})}});}

  },()=>strong.usage(),strong.admission?.(transport.state,transport.schema,'SEMANTIC_CONSTRUCTION'));
  if(saved.failure==='SEMANTIC_CONSTRUCTION_REJECTED')saved=await repairSemanticConstruction(store,{...operation,kind:'SEMANTIC_CONSTRUCTION',model:strong.model},saved,mentions,input,strong,constructionState,now,{lane,reuseContext});
  if(saved.failure==='SEMANTIC_MODEL_SCHEMA_CONTINUATION_REQUIRED'||saved.failure==='SEMANTIC_MODEL_CONTEXT_CONTINUATION_REQUIRED'||saved.failure==='SEMANTIC_MODEL_OUTPUT_CONTINUATION_REQUIRED'&&saved.usage.reported)saved=await continueSemanticConstruction(store,{...operation,kind:'SEMANTIC_CONSTRUCTION',model:strong.model,state:{...constructionState,attempt:attemptNo}},mentions,input,strong,constructionState,now,{lane,reuseContext,concurrency:inferenceConcurrency(env.V1_INFERENCE_CONCURRENCY),reconciliation:env.V1_RECONCILIATION_MODE});
  if(saved.status==='SUCCEEDED'&&saved.value && saved.value.confidence>=.6){construction={...saved.value.construction,provenance:{...saved.value.construction.provenance,judgmentId:saved.id}};const first=construction.groups[0];decision={structuralRelation:first?.structuralRelation??'NEW_STORYLINE',eventId:first?.eventId??undefined,storylineId:first?.storylineId??undefined,epistemicEffects:[...new Set(construction.groups.flatMap(g=>g.epistemicEffects))],confidence:saved.value.confidence,provenance:construction.provenance}}
  else decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:saved.failure??'SEMANTIC_REASONING_UNCERTAIN'}};
 }else if(reasons.length)decision={structuralRelation:'DEFER',epistemicEffects:decision.epistemicEffects,confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:SEMANTIC_POLICY,fallbackReason:'STRONG_MODEL_UNAVAILABLE'}};
 // Consequential cross-occurrence relationships require a separate durable
 // source-grounded question before canonical mutation. No model call in CAS.
 if(construction&&strong&&construction.groups.some(g=>g.structuralRelation==='SAME_EVENT'||g.structuralRelation==='NEW_EVENT_EXISTING_STORYLINE')){
  const reviewer=strong.forPhase?.('SEMANTIC_EVENT_IDENTITY_REVIEW')??strong;
  const request=identityReviewRequest(construction,mentions,input,active,memory.map(m=>({id:m.id,state:String(m.version?.currentState??'')}))),proposed=construction;
  const reviewed=await staged(a=>({...operation,kind:'SEMANTIC_EVENT_IDENTITY_REVIEW',policyVersion:IDENTITY_REVIEW_POLICY,model:reviewer.model,state:{...request.state,constructionJudgment:proposed.provenance.judgmentId,outputSchema:request.schema,attempt:a}}),async()=>{
   const result=await reviewer.complete(job.feedId,'SEMANTIC_EVENT_IDENTITY_REVIEW',request.state,request.schema);
   try{return {value:{construction:applyIdentityReview(proposed,result.value,input,'pending',request.state.storylines,mentions),reviews:result.value},usage:result.usage}}catch(error){throw new SemanticValidationError({stage:'CONSTRUCTION_BINDING',response:result.value,rejection:{name:error instanceof Error?error.name:'Error',code:'IDENTITY_REVIEW_REJECTED',binding:{invariant:error instanceof Error?error.message:'INVALID_IDENTITY_REVIEW',path:['groups']}}})}
  },()=>reviewer.usage(),reviewer.admission?.(request.state,request.schema,'SEMANTIC_EVENT_IDENTITY_REVIEW'));
  if(reviewed.status==='SUCCEEDED'&&reviewed.value){construction={...reviewed.value.construction,provenance:{...reviewed.value.construction.provenance,judgmentId:reviewed.id}};const first=construction.groups[0];decision={structuralRelation:first?.structuralRelation??'NEW_STORYLINE',eventId:first?.eventId??undefined,storylineId:first?.storylineId??undefined,epistemicEffects:[...new Set(construction.groups.flatMap(g=>g.epistemicEffects))],confidence:decision.confidence,provenance:construction.provenance}}
  else {construction=undefined;decision={structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:IDENTITY_REVIEW_POLICY,fallbackReason:reviewed.failure??'IDENTITY_REVIEW_UNAVAILABLE'}}}
 }
 const prepared:PreparedSemanticMatch={feedRevision:feed.revision,evidenceRevisionIds,knownEventIds:Object.keys(knownEventVersions),knownEventVersions,revisionId:revision.id,candidateVersions:Object.fromEntries(shortlist.map(c=>[c.id,c.version.id])),storylineVersions:Object.fromEntries(storylineRoots.map(s=>[s.id,s.currentVersionId])),decision},matchers=preparedMatchers(prepared);
 matchers.sourcePassages=articleFirst;
 if(construction)matchers.construction=current=>matchers.event.match(current).provenance.judgmentId===decision.provenance.judgmentId?structuredClone(construction):undefined;
 return {input,prepared,matchers};
}
