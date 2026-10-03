import {HandoffError,eventSalienceAssessmentSchema,userRelevanceSchema,windowScoreSchema,briefingCandidateSchema,sha256,type EventVersion,type EventMembership,type EvidenceRevision,type EventSalienceAssessment,type UserRelevance,type WindowScore,type BriefingCandidate,type TargetType} from '@distilled/contracts';
import {z} from 'zod';
import {V1IntakeStore} from '../v1-intake/store';
import type {AcceptedInput} from '../v1-intake/types';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {INTELLIGENCE_POLICY,tokens,features,overlap} from './policies';
import type {DuplicateDecision,EventRecord,StorylineRecord,StorylineVersion} from './types';

const SCORING_POLICY='deterministic-scoring-v1',SELECTION_POLICY='bounded-selection-v1';
export interface BriefingBudget {maxStories:number;maxReadingWords:number;maxEvidenceInspections:number;maxInputTokens:number;maxOutputTokens:number;maxModelCalls:number;maxCostUsd:number;maxPerPublisher:number;maxWallClockMs:number}
export const DEFAULT_BRIEFING_BUDGET:BriefingBudget={maxStories:5,maxReadingWords:500,maxEvidenceInspections:20,maxInputTokens:12000,maxOutputTokens:1500,maxModelCalls:2,maxCostUsd:.1,maxPerPublisher:2,maxWallClockMs:60000};
export interface PublicationWindow {start:string;end:string;kind:'30M'|'HOURLY'|'DAILY'|'WEEKLY'}
export interface SelectionRecord {id:string;feedId:string;feedRevision:number;window:PublicationWindow;candidateIds:string[];selectedCandidateIds:string[];evidenceByCandidate:Record<string,string[]>;budget:BriefingBudget;policyVersion:string;computedAt:string;omissions:{candidateId:string;reason:string}[]}
interface Target {type:TargetType;id:string;stableId:string;storylineId?:string;text:string;updatedAt:string;version:number;evidence:EvidenceRevision[];eventVersionIds:string[];storylineVersionId?:string;persistence:number;turningPoint:number}
const windowSchema=z.object({start:z.string().datetime(),end:z.string().datetime(),kind:z.enum(['30M','HOURLY','DAILY','WEEKLY'])}).strict().refine(w=>Date.parse(w.start)<Date.parse(w.end));
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
  let group=revision.id;const visited=new Set<string>();
  for(let depth=0;depth<100;depth++) {
   if(visited.has(group)) throw new HandoffError('INVALID_REQUEST');visited.add(group);
   const decision=await tx.read<DuplicateDecision>('duplicates',JSON.stringify([group,INTELLIGENCE_POLICY]));
   if(!decision?.duplicateOfRevisionId) break;group=decision.duplicateOfRevisionId;
   if(depth===99) throw new HandoffError('INVALID_REQUEST');
  }
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
async function targets(tx:FeedTransaction,window:PublicationWindow):Promise<Target[]> {
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
 const result:Target[]=[];
 for(const root of await tx.list<StorylineRecord>('storylines')) {
  const version=await tx.read<StorylineVersion>('storyline_versions',root.currentVersionId);if(!version?.eventVersionIds.length || version.eventVersionIds.some(id=>!events.has(id))) continue;
  for(const id of version.eventVersionIds) events.get(id)!.storylineId=root.id;
  if(window.kind==='WEEKLY') result.push({type:'STORYLINE',id:version.id,stableId:root.id,storylineId:root.id,text:version.currentState,updatedAt:version.createdAt,version:version.version,evidence:[...new Map(version.eventVersionIds.flatMap(id=>events.get(id)!.evidence).map(r=>[r.id,r])).values()],eventVersionIds:version.eventVersionIds,storylineVersionId:version.id,persistence:score(version.eventVersionIds.length/4),turningPoint:score(version.turningPoints.length/3)});
 }
 if(window.kind!=='WEEKLY') result.push(...events.values());
 return result.filter(t=>Date.parse(t.updatedAt)>=Date.parse(window.start) && Date.parse(t.updatedAt)<Date.parse(window.end));
}
export async function scoreAndSelect(store:V1FeedStore,feedId:string,rawWindow:PublicationWindow,rawBudget:BriefingBudget,now:string):Promise<SelectionRecord> {
 const parsedWindow=windowSchema.safeParse(rawWindow),parsedBudget=budgetSchema.safeParse(rawBudget);
 if(!parsedWindow.success || !parsedBudget.success || !Number.isFinite(Date.parse(now))) throw new HandoffError('INVALID_REQUEST');
 const window={...parsedWindow.data,start:new Date(parsedWindow.data.start).toISOString(),end:new Date(parsedWindow.data.end).toISOString()},budget=parsedBudget.data;
 return feedTransact(store,feedId,async tx=>{
  const candidates=await targets(tx,window),identity=await sha256(canonicalJson({feedId,revision:tx.snapshot.feed.revision,window,budget,targets:candidates.map(t=>[t.type,t.id]).sort(),policy:SELECTION_POLICY}));
  const prior=await tx.read<SelectionRecord>('selections',identity);if(prior) return prior;
  const editions=await tx.list<{id:string;feedId:string;eventVersionIds:string[];storylineVersionIds:string[]}>('editions');
  const published=new Set(editions.flatMap(e=>[...e.eventVersionIds,...e.storylineVersionIds]));
  const assessments:{target:Target;candidate:BriefingCandidate;publisherIds:string[]}[]=[];
  for(const target of candidates) {
   const base={feedId,feedRevision:tx.snapshot.feed.revision,targetType:target.type,targetVersionId:target.id,policyVersion:SCORING_POLICY,computedAt:now};
   const assessmentId=await sha256(canonicalJson({feedId,target:target.id,revision:base.feedRevision,policy:SCORING_POLICY}));
   const independent=await independentSupportCount(tx,target.evidence),novelty=published.has(target.id)?0:1;
   const recency=score(1-(Date.parse(window.end)-Math.max(...target.evidence.map(r=>Date.parse(r.publishedAt??r.acceptedAt))))/(Date.parse(window.end)-Date.parse(window.start)));
   const impact=score(.35+.1*Math.min(3,features(target.text).entities.length));
   const salience:EventSalienceAssessment=eventSalienceAssessmentSchema.parse({id:`salience:${assessmentId}`,...base,impact,novelty,changeMagnitude:target.version>1?.7:1,institutionalSignificance:/\b(parliament|government|court|central bank)\b/i.test(target.text)?.8:.3,corroboration:score(independent/3),persistence:target.persistence,recency,overallScore:score(.35*impact+.25*novelty+.2*score(independent/3)+.2*target.persistence)});
   const interests=tokens(tx.snapshot.feed.interests.join(' ')),words=tokens(target.text),topicMatch=interests.length?score(interests.filter(w=>words.includes(w)).length/interests.length):.5;
   const geographyMatch=tx.snapshot.feed.geography.length?score(tx.snapshot.feed.geography.filter(g=>target.text.toLowerCase().includes(g.toLowerCase())).length/tx.snapshot.feed.geography.length):.5;
   const relevance:UserRelevance=userRelevanceSchema.parse({id:`relevance:${assessmentId}`,...base,topicMatch,geographyMatch,entityMatch:overlap(features(tx.snapshot.feed.interests.join(' ')).entities,features(target.text).entities),sourcePreference:.5,languageFit:1,overallScore:score(.75*topicMatch+.25*geographyMatch)});
   const windowId=await sha256(canonicalJson({assessmentId,start:window.start,end:window.end}));
   const weekly=window.kind==='WEEKLY';
   const ws:WindowScore=windowScoreSchema.parse({id:`window:${windowId}`,...base,windowStart:window.start,windowEnd:window.end,windowKind:window.kind,components:{recency,novelty,changeMagnitude:salience.changeMagnitude,impact,persistence:target.persistence,turningPoint:target.turningPoint},finalScore:score(weekly?.25*impact+.25*target.persistence+.2*target.turningPoint+.2*novelty+.1*recency:.35*novelty+.3*recency+.2*impact+.15*salience.changeMagnitude),reasonCodes:[novelty?'NEW_DEVELOPMENT':'LOW_NOVELTY',...(weekly&&target.persistence>0?['PERSISTENT_STORYLINE']:[])],policyVersion:SCORING_POLICY});
   await tx.write('salience',salience.id,(await tx.read('salience',salience.id))??salience);await tx.write('relevance',relevance.id,(await tx.read('relevance',relevance.id))??relevance);await tx.write('window_scores',ws.id,(await tx.read('window_scores',ws.id))??ws);
   const savedSalience=await tx.read<EventSalienceAssessment>('salience',salience.id),savedRelevance=await tx.read<UserRelevance>('relevance',relevance.id),savedWindow=await tx.read<WindowScore>('window_scores',ws.id);
   if(savedWindow?.windowKind!==window.kind) throw new HandoffError('INVALID_REQUEST');
   const candidate:BriefingCandidate={id:JSON.stringify([identity,target.type,target.id]),feedId,feedRevision:base.feedRevision,targetType:target.type,targetVersionId:target.id,salienceAssessmentId:salience.id,relevanceAssessmentId:relevance.id,windowScoreId:ws.id,initialScore:score(.3*savedSalience!.overallScore+.35*savedRelevance!.overallScore+.35*savedWindow!.finalScore),reasons:[novelty?'NEW_DEVELOPMENT':'LOW_NOVELTY'],selectionState:'ELIGIBLE',selectionPolicyVersion:SELECTION_POLICY};
   assessments.push({target,candidate,publisherIds:[...new Set(await Promise.all(target.evidence.map(r=>publisherIdentity(tx,r))))]});
  }
  assessments.sort((a,b)=>b.candidate.initialScore-a.candidate.initialScore||a.candidate.targetVersionId.localeCompare(b.candidate.targetVersionId));
  const result:SelectionRecord={id:identity,feedId,feedRevision:tx.snapshot.feed.revision,window,candidateIds:assessments.map(a=>a.candidate.id),selectedCandidateIds:[],evidenceByCandidate:{},budget,policyVersion:SELECTION_POLICY,computedAt:now,omissions:[]};
  const selectedStorylines=new Set<string>(),publishers=new Map<string,number>();let words=0,inspections=0,inputTokens=0;
  for(const {target,candidate,publisherIds} of assessments) {
   const inspectionEvidence=[...target.evidence].sort((a,b)=>(b.body?.length??0)-(a.body?.length??0)||a.id.localeCompare(b.id)).slice(0,3);
   const cost=inspectionEvidence.reduce((sum,r)=>sum+new TextEncoder().encode((r.body??r.title??'').slice(0,1800)).length,0),storyWords=Math.min(100,tokens(target.text).length);
   let reason:string|undefined;
   if(published.has(target.id) && window.kind!=='WEEKLY') reason='REDUNDANT_UPDATE';
   else if(result.selectedCandidateIds.length>=budget.maxStories) reason='STORY_BUDGET';
   else if(words+storyWords>budget.maxReadingWords || inspections+inspectionEvidence.length>budget.maxEvidenceInspections || inputTokens+cost>budget.maxInputTokens) reason='SYNTHESIS_BUDGET';
   else if(target.storylineId && selectedStorylines.has(target.storylineId)) reason='STORYLINE_DIVERSITY';
   else if(publisherIds.some(id=>(publishers.get(id)??0)>=budget.maxPerPublisher)) reason='SOURCE_DIVERSITY';
   if(reason) {candidate.selectionState='OMITTED';candidate.reasons.push(reason);result.omissions.push({candidateId:candidate.id,reason})}
   else {candidate.selectionState='SELECTED';result.selectedCandidateIds.push(candidate.id);result.evidenceByCandidate[candidate.id]=inspectionEvidence.map(r=>r.id);words+=storyWords;inspections+=inspectionEvidence.length;inputTokens+=cost;if(target.storylineId) selectedStorylines.add(target.storylineId);for(const id of publisherIds) publishers.set(id,(publishers.get(id)??0)+1)}
   await tx.write('candidates',candidate.id,briefingCandidateSchema.parse(candidate));
  }
  await tx.write('selections',identity,result);return result;
 });
}
