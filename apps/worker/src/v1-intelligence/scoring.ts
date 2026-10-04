import {HandoffError,eventSalienceAssessmentSchema,userRelevanceSchema,windowScoreSchema,briefingCandidateSchema,sha256,type EventVersion,type EventMembership,type EvidenceRevision,type EventSalienceAssessment,type UserRelevance,type WindowScore,type BriefingCandidate,type TargetType} from '@distilled/contracts';
import {z} from 'zod';
import {evaluateEditorialDelta,communicationFingerprint,boundedEditorialContext,priorContextEvidence,type EditorialDecision} from './editorial';
import {publicationWindowSchema,type LiveInterval} from './schedule';
import {DeterministicSalienceScorer,type EventSalienceScorer,type SalienceInput} from './salience';
import {durableSalience} from './salience-persistence';
import {SEMANTIC_SALIENCE_POLICY} from './salience-router';
import {V1IntakeStore} from '../v1-intake/store';
import type {AcceptedInput} from '../v1-intake/types';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {INTELLIGENCE_POLICY,tokens,features,overlap} from './policies';
import type {DuplicateDecision,EventRecord,StorylineRecord,StorylineVersion} from './types';
import type {EditorialPlanRecord,PlanStory} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';

const SCORING_POLICY='deterministic-scoring-editorial-v4',SELECTION_POLICY='bounded-selection-editorial-v6';
const salienceScorer=new DeterministicSalienceScorer();
export interface BriefingBudget {maxStories:number;maxReadingWords:number;maxEvidenceInspections:number;maxInputTokens:number;maxOutputTokens:number;maxModelCalls:number;maxCostUsd:number;maxPerPublisher:number;maxWallClockMs:number}
export const DEFAULT_BRIEFING_BUDGET:BriefingBudget={maxStories:5,maxReadingWords:500,maxEvidenceInspections:20,maxInputTokens:12000,maxOutputTokens:1500,maxModelCalls:2,maxCostUsd:.1,maxPerPublisher:2,maxWallClockMs:60000};
export interface PublicationWindow {start:string;end:string;kind:'30M'|'HOURLY'|'DAILY'|'WEEKLY';durationMinutes?:LiveInterval;timezone?:string;deliveryAnchor?:string;schedulePolicy?:'local-calendar-anchors-v1'}
export interface SelectionRecord {id:string;feedId:string;feedRevision:number;window:PublicationWindow;candidateIds:string[];selectedCandidateIds:string[];evidenceByCandidate:Record<string,string[]>;budget:BriefingBudget;policyVersion:string;computedAt:string;omissions:{candidateId:string;reason:string}[];editorialByCandidate?:Record<string,EditorialDecision>;communicationFingerprint?:string;editorialPlanId?:string;deferredProtectedTargetIds?:string[]}
export interface Target {type:TargetType;id:string;stableId:string;storylineId?:string;text:string;updatedAt:string;version:number;evidence:EvidenceRevision[];eventVersionIds:string[];storylineVersionId?:string;persistence:number;turningPoint:number}
const windowSchema=publicationWindowSchema;
const budgetSchema=z.object({maxStories:z.number().int().min(1).max(20),maxReadingWords:z.number().int().min(20).max(3000),maxEvidenceInspections:z.number().int().min(1).max(100),maxInputTokens:z.number().int().min(100).max(64000),maxOutputTokens:z.number().int().min(100).max(8000),maxModelCalls:z.number().int().min(0).max(2),maxCostUsd:z.number().min(0).max(2),maxPerPublisher:z.number().int().min(1).max(20),maxWallClockMs:z.number().int().min(1000).max(120000)}).strict();
function score(n:number):number {return Math.round(Math.max(0,Math.min(1,n))*1e6)/1e6}
export async function publisherIdentity(tx:FeedTransaction,revision:EvidenceRevision):Promise<string> {
 const row=await new V1IntakeStore(tx.store.db).read<AcceptedInput>('inputs',revision.sourceObservationId);
 if(!row || row.value.observation.feedId!==tx.snapshot.feed.id) throw new HandoffError('SCOPE_DENIED');
 if(row.value.observation.publisherId) return row.value.observation.publisherId;
 if(revision.canonicalUrl) return new URL(revision.canonicalUrl).hostname.toLowerCase().replace(/^www\./,'');
 return row.value.observation.sourceId;
}
export async function independentSupportCount(tx:FeedTransaction,revisions:EvidenceRevision[]):Promise<number> {
 const groups=new Map<string,Set<string>>();
 for(const revision of revisions) {
  const source=(await tx.list<import('./claims').SourceDocument>('source_documents')).find(d=>d.evidenceRevisionId===revision.id),inferred=(await tx.list<{id:string;evidenceRevisionId:string;dependencyLabel:string}>('source_origins')).find(o=>o.evidenceRevisionId===revision.id);
  const origin=inferred?.dependencyLabel??(source?.origin.kind==='EXPLICIT_DEPENDENCY'?source.origin.label:undefined);
  let group=revision.id;const visited=new Set<string>();
  for(let depth=0;depth<100;depth++) {
   if(visited.has(group)) throw new HandoffError('INVALID_REQUEST');visited.add(group);
   const decision=await tx.read<DuplicateDecision>('duplicates',JSON.stringify([group,INTELLIGENCE_POLICY]));
   if(!decision?.duplicateOfRevisionId) break;group=decision.duplicateOfRevisionId;
   if(depth===99) throw new HandoffError('INVALID_REQUEST');
  }
  if(origin)group=`origin:${origin.normalize('NFKC').trim().toLowerCase()}`;
  const publishers=groups.get(group)??new Set<string>();publishers.add(await publisherIdentity(tx,revision));groups.set(group,publishers);
 }
 // Maximum bipartite matching counts neither copied groups nor repeated publishers twice.
 const assigned=new Map<string,string>();
 const match=(group:string,seen:Set<string>):boolean=>{
  for(const publisher of [...groups.get(group)!].sort()) {
   if(seen.has(publisher)) continue;seen.add(publisher);
   const previous=assigned.get(publisher);if(!previous || match(previous,seen)) {assigned.set(publisher,group);return true}
  }return false;
 };
 for(const group of [...groups.keys()].sort()) match(group,new Set());return assigned.size;
}
export async function targets(tx:FeedTransaction,window:PublicationWindow,includeOutsideWindow=false):Promise<Target[]> {
 const active=new Map((await tx.store.currentEvidence(tx.snapshot.feed.id)).map(r=>[r.revision.id,r.revision]));
 const roots=await tx.list<EventRecord>('events'),events=new Map<string,Target>();
 const memberships=await tx.list<EventMembership>('memberships');
 for(const root of roots) {
  const version=await tx.read<EventVersion>('event_versions',root.currentVersionId);if(!version || version.type==='WITHDRAWN') continue;
  const ids=memberships.filter(m=>m.eventVersionId===version.id).map(m=>m.evidenceRevisionId);
  if(!ids.length || ids.some(id=>!active.has(id))) continue;
  const evidence=ids.map(id=>active.get(id)!);
  events.set(version.id,{type:'EVENT',id:version.id,stableId:root.id,text:`${version.title??''}\n${version.state}`,updatedAt:version.createdAt,version:version.version,evidence,eventVersionIds:[version.id],persistence:0,turningPoint:version.version>1?1:0});
 }
 const result:Target[]=[],groupedEvents=new Set<string>(),longWindow=window.kind==='WEEKLY' || (window.durationMinutes??0)>=720;
 for(const root of await tx.list<StorylineRecord>('storylines')) {
  const version=await tx.read<StorylineVersion>('storyline_versions',root.currentVersionId);if(!version?.eventVersionIds.length || version.eventVersionIds.some(id=>!events.has(id))) continue;
  for(const id of version.eventVersionIds) events.get(id)!.storylineId=root.id;
  if(longWindow) {
   result.push({type:'STORYLINE',id:version.id,stableId:root.id,storylineId:root.id,text:version.currentState,updatedAt:version.createdAt,version:version.version,evidence:[...new Map(version.eventVersionIds.flatMap(id=>events.get(id)!.evidence).map(r=>[r.id,r])).values()],eventVersionIds:version.eventVersionIds,storylineVersionId:version.id,persistence:score(version.eventVersionIds.length/4),turningPoint:score(version.turningPoints.length/3)});
   for(const id of version.eventVersionIds) groupedEvents.add(id);
  }
 }
 if(window.kind!=='WEEKLY') result.push(...[...events.values()].filter(t=>!groupedEvents.has(t.id)));
 return result.filter(t=>Date.parse(t.updatedAt)<Date.parse(window.end) && (includeOutsideWindow||Date.parse(t.updatedAt)>=Date.parse(window.start)));
}
function deterministicPrefilter(editorial:EditorialDecision,interests:string[],geography:string[]):void {
 if(editorial.decision!=='INCLUDE')return;
    const feedWords=new Set(tokens([...interests,...geography].join(' ')));
    const lowInformation=editorial.newUnderstanding.every(f=>{
     if(!/\b(no substantive change|routine roundup|no material update)\b/i.test(f.text)) return false;
     const remainder=f.text.replace(/\b(no substantive change|routine roundup|no material update)\b/gi,'');
     return tokens(remainder).every(word=>feedWords.has(word));
    });
    // Literal term nonmatch is unknown semantic relevance, not proof of irrelevance.
    if(lowInformation) {editorial.decision='SUPPRESS';editorial.reasonCodes=['LOW_INFORMATION_GAIN'];editorial.treatment='OMIT';editorial.contextNeed='NONE'}
}
export async function scoreAndSelect(store:V1FeedStore,feedId:string,rawWindow:PublicationWindow,rawBudget:BriefingBudget,now:string,semanticScorer?:EventSalienceScorer,plan?:EditorialPlanRecord):Promise<SelectionRecord> {
 const parsedWindow=windowSchema.safeParse(rawWindow),parsedBudget=budgetSchema.safeParse(rawBudget);
 if(!parsedWindow.success || !parsedBudget.success || !Number.isFinite(Date.parse(now))) throw new HandoffError('INVALID_REQUEST');
 const window={...parsedWindow.data,start:new Date(parsedWindow.data.start).toISOString(),end:new Date(parsedWindow.data.end).toISOString()},budget=parsedBudget.data;
 const resolved=new Map<string,Awaited<ReturnType<typeof durableSalience>>>();
 const targetList=async(tx:FeedTransaction)=>{
  const values=await targets(tx,window,Boolean(plan));if(!plan)return values;
  if(plan.feedId!==feedId||plan.feedRevision!==tx.snapshot.feed.revision||canonicalJson({...plan.window,start:new Date(plan.window.start).toISOString(),end:new Date(plan.window.end).toISOString()})!==canonicalJson(window)||plan.communicationFingerprint!==await communicationFingerprint(tx,window.end))throw new HandoffError('TEMPORARY_UNAVAILABLE');
  const selected=values.filter(t=>plan.stories.some(s=>s.targetVersionId===t.id));if(selected.length!==plan.stories.length)throw new HandoffError('TEMPORARY_UNAVAILABLE');return selected;
 };
 const planEditorial=async(tx:FeedTransaction,target:Target):Promise<EditorialDecision>=>{
  const editorial=await evaluateEditorialDelta(tx,target,window.end);if(!plan){deterministicPrefilter(editorial,tx.snapshot.feed.interests,tx.snapshot.feed.geography);return editorial}
  const story=plan.stories.find(s=>s.targetVersionId===target.id)!,shortlist=await tx.read<ShortlistRecord>('shortlists',plan.shortlistId),candidate=shortlist?.candidates.find(c=>c.targetVersionId===target.id);if(!candidate)throw new HandoffError('SCOPE_DENIED');
  editorial.decision=story.decision==='SELECT'?'INCLUDE':'SUPPRESS';editorial.treatment=story.treatment;editorial.newUnderstanding=candidate.facts.filter(f=>[...story.mustIncludeFactIds,...story.newUnderstandingFactIds,...story.contextFactIds].includes(f.id)).map(f=>({text:f.text,evidenceRevisionIds:f.evidenceRevisionIds}));editorial.reasonCodes=story.decision==='SELECT'?['MATERIAL_NEW_FACT']:['ALREADY_COMMUNICATED'];return editorial;
 };
 if(semanticScorer){
  const inputs=await feedTransact(store,feedId,async tx=>{
   const inputs:SalienceInput[]=[];
   for(const target of await targetList(tx)){
    const editorial=await planEditorial(tx,target);
    if(editorial.decision==='SUPPRESS')continue;
    inputs.push({feedId,feedRevision:tx.snapshot.feed.revision,targetType:target.type,targetVersionId:target.id,text:target.text.slice(0,6000),version:target.version,independentSupport:await independentSupportCount(tx,target.evidence),persistence:target.persistence,recency:1});
   }
   return inputs;
  });
  const salienceWindowId=await sha256(canonicalJson({feedId,window,policy:semanticScorer.policyKey??SEMANTIC_SALIENCE_POLICY}));
  for(const input of inputs)resolved.set(input.targetVersionId,await durableSalience(store,input,semanticScorer,now,salienceWindowId));
 }
 return feedTransact(store,feedId,async tx=>{
  const candidates=await targetList(tx),communication=await communicationFingerprint(tx,window.end),identity=await sha256(canonicalJson({feedId,revision:tx.snapshot.feed.revision,window,budget,communication,editorialPlanId:plan?.id,targets:candidates.map(t=>[t.type,t.id]).sort(),policy:semanticScorer?`${SELECTION_POLICY}:${semanticScorer.policyKey??SEMANTIC_SALIENCE_POLICY}`:SELECTION_POLICY}));
  const prior=await tx.read<SelectionRecord>('selections',identity);if(prior) return prior;
  const assessments:{target:Target;candidate:BriefingCandidate;publisherIds:string[];editorial:EditorialDecision}[]=[];
  for(const target of candidates) {
   const base={feedId,feedRevision:tx.snapshot.feed.revision,targetType:target.type,targetVersionId:target.id,policyVersion:semanticScorer?(semanticScorer.policyKey??SEMANTIC_SALIENCE_POLICY):SCORING_POLICY,computedAt:now};
   const assessmentId=await sha256(canonicalJson({feedId,target:target.id,revision:base.feedRevision,policy:base.policyVersion}));
   const editorial=await planEditorial(tx,target);
   const independent=await independentSupportCount(tx,target.evidence);
   const recency=score(1-(Date.parse(window.end)-Math.max(...target.evidence.map(r=>Date.parse(r.publishedAt??r.acceptedAt))))/(Date.parse(window.end)-Date.parse(window.start)));
   const savedJudgment=resolved.get(target.id);
   if(semanticScorer && editorial.decision!=='SUPPRESS' && (!savedJudgment || savedJudgment.input.feedRevision!==base.feedRevision))throw new HandoffError('TEMPORARY_UNAVAILABLE');
   const baseline=savedJudgment?.result??salienceScorer.score({feedId,feedRevision:base.feedRevision,targetType:target.type,targetVersionId:target.id,text:target.text.slice(0,6000),version:target.version,independentSupport:independent,persistence:target.persistence,recency});
   if(savedJudgment && !await tx.read('salience_provenance',`salience:${assessmentId}`))await tx.write('salience_provenance',`salience:${assessmentId}`,{id:`salience:${assessmentId}`,feedId,assessmentId:`salience:${assessmentId}`,judgmentId:savedJudgment.id,input:savedJudgment.input,result:savedJudgment.result,createdAt:savedJudgment.createdAt});
   if(semanticScorer && !savedJudgment && !await tx.read('salience_provenance',`salience:${assessmentId}`))await tx.write('salience_provenance',`salience:${assessmentId}`,{id:`salience:${assessmentId}`,feedId,assessmentId:`salience:${assessmentId}`,result:{...baseline,route:'DETERMINISTIC_PREFILTER',reasonCodes:editorial.reasonCodes},createdAt:now});
   const impact=baseline.components.impact;
   const salience:EventSalienceAssessment=eventSalienceAssessmentSchema.parse({id:`salience:${assessmentId}`,...base,...baseline.components});
   const interests=tokens(tx.snapshot.feed.interests.join(' ')),words=tokens(target.text),topicMatch=interests.length?score(interests.filter(w=>words.includes(w)).length/interests.length):.5;
   const geographyMatch=tx.snapshot.feed.geography.length?score(tx.snapshot.feed.geography.filter(g=>target.text.toLowerCase().includes(g.toLowerCase())).length/tx.snapshot.feed.geography.length):.5;
   const relevance:UserRelevance=userRelevanceSchema.parse({id:`relevance:${assessmentId}`,...base,topicMatch,geographyMatch,entityMatch:overlap(features(tx.snapshot.feed.interests.join(' ')).entities,features(target.text).entities),sourcePreference:.5,languageFit:1,overallScore:score(.75*topicMatch+.25*geographyMatch)});
   if(editorial.decision==='INCLUDE' && !plan) {
    if((window.durationMinutes??0)>=720 && target.eventVersionIds.length>1) {editorial.contextNeed='HIGH';editorial.treatment='DETAILED'}
    else if(salience.overallScore>=.8 && editorial.newUnderstanding.length>1 && editorial.treatment==='BRIEF') editorial.treatment='STANDARD';
   }
   const novelty=editorial.decision==='SUPPRESS'?0:score(1-.5*editorial.repeatPenalty);
   const windowContext=await sha256(canonicalJson({window,communication}));
   const windowId=await sha256(canonicalJson({assessmentId,windowContext}));
   const duration=window.durationMinutes??(window.kind==='WEEKLY'?10080:window.kind==='DAILY'?1440:window.kind==='30M'?30:60),longWeight=score((duration-30)/(1440-30));
   const shortScore=.35*novelty+.3*recency+.2*impact+.15*salience.changeMagnitude,longScore=.25*impact+.25*target.persistence+.2*target.turningPoint+.2*novelty+.1*recency;
   const ws:WindowScore=windowScoreSchema.parse({id:`window:${windowId}`,...base,windowStart:window.start,windowEnd:window.end,windowKind:window.kind,components:{recency,novelty,changeMagnitude:salience.changeMagnitude,impact,persistence:target.persistence,turningPoint:target.turningPoint},finalScore:editorial.decision==='SUPPRESS'?0:score((1-longWeight)*shortScore+longWeight*longScore),reasonCodes:[novelty?'NEW_DEVELOPMENT':'LOW_NOVELTY',...(longWeight>=.5&&target.persistence>0?['PERSISTENT_STORYLINE']:[])],policyVersion:`${SCORING_POLICY}:window-context:${windowContext}`});
   await tx.write('salience',salience.id,(await tx.read('salience',salience.id))??salience);await tx.write('relevance',relevance.id,(await tx.read('relevance',relevance.id))??relevance);await tx.write('window_scores',ws.id,(await tx.read('window_scores',ws.id))??ws);
   const savedSalience=await tx.read<EventSalienceAssessment>('salience',salience.id),savedRelevance=await tx.read<UserRelevance>('relevance',relevance.id),savedWindow=await tx.read<WindowScore>('window_scores',ws.id);
   if(savedWindow?.windowKind!==window.kind) throw new HandoffError('INVALID_REQUEST');
   const candidate:BriefingCandidate={id:JSON.stringify([identity,target.type,target.id]),feedId,feedRevision:base.feedRevision,targetType:target.type,targetVersionId:target.id,salienceAssessmentId:salience.id,relevanceAssessmentId:relevance.id,windowScoreId:ws.id,initialScore:score(.3*savedSalience!.overallScore+.35*savedRelevance!.overallScore+.35*savedWindow!.finalScore),reasons:[novelty?'NEW_DEVELOPMENT':'LOW_NOVELTY'],selectionState:'ELIGIBLE',selectionPolicyVersion:SELECTION_POLICY};
   assessments.push({target,candidate,editorial,publisherIds:[...new Set(await Promise.all(target.evidence.map(r=>publisherIdentity(tx,r))))]});
  }
  assessments.sort((a,b)=>plan?plan.stories.find(s=>s.targetVersionId===a.target.id)!.order-plan.stories.find(s=>s.targetVersionId===b.target.id)!.order:b.candidate.initialScore-a.candidate.initialScore||a.candidate.targetVersionId.localeCompare(b.candidate.targetVersionId));
  const result:SelectionRecord={id:identity,feedId,feedRevision:tx.snapshot.feed.revision,window,candidateIds:assessments.map(a=>a.candidate.id),selectedCandidateIds:[],evidenceByCandidate:{},budget,policyVersion:SELECTION_POLICY,computedAt:now,omissions:[],editorialByCandidate:{},communicationFingerprint:communication};
  const f=tx.snapshot.feed;
  const selectedStorylines=new Set<string>(),publishers=new Map<string,number>();let words=0,inspections=0,inputTokens=new TextEncoder().encode(JSON.stringify({feed:{id:f.id,revision:f.revision,title:f.title,interests:f.interests,outputLanguage:f.outputLanguage},selectionId:identity,window,stories:[]})).length;
  for(const {target,candidate,publisherIds,editorial} of assessments) {
   const planned=plan?.stories.find(s=>s.targetVersionId===target.id),scope=plan?(await tx.read<ShortlistRecord>('shortlists',plan.shortlistId))?.candidates.find(c=>c.targetVersionId===target.id):undefined;
   const requiredIds=new Set(planned?[...planned.mustIncludeFactIds,...planned.newUnderstandingFactIds,...planned.attributionFactIds,...planned.certaintyFactIds,...planned.disagreementFactIds,...planned.openQuestionFactIds]:[]);
   const inspectionFacts=scope?scope.facts.filter(f=>requiredIds.has(f.id)):editorial.newUnderstanding;
   const uncovered=new Set(inspectionFacts.map((_,i)=>i)),inspectionEvidence:EvidenceRevision[]=[];
   const available=[...target.evidence];
   while(uncovered.size && available.length) {
    available.sort((a,b)=>[...uncovered].filter(i=>inspectionFacts[i].evidenceRevisionIds.includes(b.id)).length-[...uncovered].filter(i=>inspectionFacts[i].evidenceRevisionIds.includes(a.id)).length || (a.body?.length??0)-(b.body?.length??0) || a.id.localeCompare(b.id));
    const revision=available.shift()!;inspectionEvidence.push(revision);
    for(const i of uncovered) if(inspectionFacts[i].evidenceRevisionIds.includes(revision.id)) uncovered.delete(i);
   }
   for(const revision of priorContextEvidence(editorial,target.evidence)) if(!inspectionEvidence.some(e=>e.id===revision.id)) inspectionEvidence.push(revision);
   const eventVersions=(await Promise.all(target.eventVersionIds.map(id=>tx.read<EventVersion>('event_versions',id)))).map(v=>({...v!,state:v!.state.slice(0,1800)}));
   const storyline=target.storylineVersionId?await tx.read<StorylineVersion>('storyline_versions',target.storylineVersionId):undefined;
   const cost=new TextEncoder().encode(JSON.stringify({candidate:{...candidate,selectionState:'SELECTED'},eventVersions,editorial:boundedEditorialContext(editorial),storylineVersion:storyline?{...storyline,currentState:storyline.currentState.slice(0,1800),previousState:storyline.previousState?.slice(0,1000),supportedFacts:storyline.supportedFacts.slice(0,10),turningPoints:storyline.turningPoints.slice(0,10)}:undefined,evidence:inspectionEvidence.map(e=>({...e,excerptTruncated:false}))})).length+1,storyWords=Math.min(editorial.treatment==='DETAILED'?180:editorial.treatment==='STANDARD'?100:40,tokens(target.text).length);
   let reason:string|undefined;
   result.editorialByCandidate![candidate.id]=editorial;
   if(editorial.decision==='SUPPRESS') reason=editorial.reasonCodes[0];
   else if(plan&&uncovered.size)reason='MISSING_REQUIRED_PLAN_SUPPORT';
   else if(result.selectedCandidateIds.length>=budget.maxStories) reason='STORY_BUDGET';
   else if(words+storyWords>budget.maxReadingWords || inspections+inspectionEvidence.length>budget.maxEvidenceInspections || inputTokens+cost>budget.maxInputTokens) reason='SYNTHESIS_BUDGET';
   else if(!plan && target.storylineId && selectedStorylines.has(target.storylineId)) reason='STORYLINE_DIVERSITY';
   else if(!plan && publisherIds.some(id=>(publishers.get(id)??0)>=budget.maxPerPublisher)) reason='SOURCE_DIVERSITY';
   if(reason) {candidate.selectionState='OMITTED';candidate.reasons.push(reason);result.omissions.push({candidateId:candidate.id,reason})}
   else {candidate.selectionState='SELECTED';result.selectedCandidateIds.push(candidate.id);result.evidenceByCandidate[candidate.id]=inspectionEvidence.map(r=>r.id);words+=storyWords;inspections+=inspectionEvidence.length;inputTokens+=cost;if(target.storylineId) selectedStorylines.add(target.storylineId);for(const id of publisherIds) publishers.set(id,(publishers.get(id)??0)+1)}
   await tx.write('candidates',candidate.id,briefingCandidateSchema.parse(candidate));
  }
  if(plan){
   const shortlist=await tx.read<ShortlistRecord>('shortlists',plan.shortlistId);if(!shortlist)throw new HandoffError('SCOPE_DENIED');
   const selectedVersions=new Set(assessments.filter(a=>a.candidate.selectionState==='SELECTED').map(a=>a.target.id)),effectiveId=JSON.stringify([plan.id,identity]);
   const effective:EditorialPlanRecord={...plan,id:effectiveId,stories:plan.stories.map(s=>s.decision==='SELECT'&&!selectedVersions.has(s.targetVersionId)?{...s,decision:'DEFER',treatment:'OMIT',rationale:'Explicit synthesis capacity deferral.'}:s),obligations:plan.obligations.map(o=>o.handling==='ADDRESS'&&!selectedVersions.has(o.targetVersionId??'')?{...o,handling:'DEFER',reason:'Supported target deferred by synthesis capacity.'}:o)};
   await tx.write('editorial_plans',effectiveId,effective);result.editorialPlanId=effectiveId;
   result.deferredProtectedTargetIds=effective.stories.filter(s=>s.decision==='DEFER'&&shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)?.protectedReasons.length).map(s=>s.targetVersionId);
   if(effective.obligations.some(o=>o.handling==='DEFER'))result.deferredProtectedTargetIds.push(...effective.obligations.filter(o=>o.handling==='DEFER').map(o=>`obligation:${o.obligationId}`));
   for(const s of effective.stories.filter(s=>s.decision==='DEFER'||s.decision==='SELECT')){const c=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;if(c.protectedReasons.length){const id=JSON.stringify([effectiveId,s.targetVersionId]);await tx.write('editorial_deferred_work',id,{id,feedId,planId:effectiveId,targetVersionId:s.targetVersionId,stableTargetId:c.stableTargetId,storylineId:c.storylineId,protectedReasons:c.protectedReasons,reason:s.decision==='SELECT'?'AWAITING_SUPPORTED_PUBLICATION':s.rationale,createdAt:now})}}
  }
  await tx.write('selections',identity,result);return result;
 });
}
