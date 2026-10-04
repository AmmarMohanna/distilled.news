import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore} from './store';
import {communicationFingerprint,equivalentFact} from './editorial';
import {durableSemanticOperation} from './semantic-operations';
import type {StrongSemanticModel} from './semantic-model';
import type {ShortlistRecord,ShortlistCandidate} from './shortlist';
import type {BriefingBudget} from './scoring';
export const EDITORIAL_PLAN_POLICY='comparative-editorial-plan-v2';
const ids=z.array(z.string().min(1)).max(100);
export const planStorySchema=z.object({targetType:z.enum(['EVENT','STORYLINE']),targetVersionId:z.string().min(1),decision:z.enum(['SELECT','SUPPRESS','DEFER']),order:z.number().int().nonnegative(),treatment:z.enum(['OMIT','BRIEF','STANDARD','DETAILED']),deltaType:z.enum(['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']),newUnderstandingFactIds:ids,contextFactIds:ids,mustIncludeFactIds:ids,attributionFactIds:ids,certaintyFactIds:ids,disagreementFactIds:ids,openQuestionFactIds:ids,correctionObligationIds:ids,previousLedgerEntryIds:ids,rationale:z.string().min(1).max(600),relevanceRationale:z.string().min(1).max(600)}).strict();
export type PlanStory=z.infer<typeof planStorySchema>;
const obligationSchema=z.object({obligationId:z.string(),handling:z.enum(['ADDRESS','DEFER']),targetVersionId:z.string().nullable(),reason:z.string().min(1).max(600)}).strict();
export const planBodySchema=z.object({stories:z.array(planStorySchema).max(100),obligations:z.array(obligationSchema).max(100)}).strict();
export type EditorialPlanBody=z.infer<typeof planBodySchema>;
export interface EditorialPlanRecord extends EditorialPlanBody {id:string;feedId:string;feedRevision:number;shortlistId:string;window:ShortlistRecord['window'];communicationFingerprint:string;route:'GPT'|'DETERMINISTIC_FALLBACK';operationId?:string;fallbackReason?:string;evidenceRevisionIds:string[];policyVersion:string;createdAt:string}
const allRefs=(s:PlanStory)=>[...s.newUnderstandingFactIds,...s.contextFactIds,...s.mustIncludeFactIds,...s.attributionFactIds,...s.certaintyFactIds,...s.disagreementFactIds,...s.openQuestionFactIds];
function knownFacts(c:ShortlistCandidate,shortlist:ShortlistRecord):string[]{return shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||c.storylineId && e.storylineIds?.includes(c.storylineId)).flatMap(e=>e.claimFacts)}
export function validateEditorialPlan(raw:EditorialPlanBody,shortlist:ShortlistRecord):EditorialPlanBody {
 const plan=planBodySchema.parse(raw),targets=new Set(plan.stories.map(s=>s.targetVersionId));
 if(targets.size!==plan.stories.length||targets.size!==shortlist.candidates.length||shortlist.candidates.some(c=>!targets.has(c.targetVersionId)))throw new HandoffError('SCOPE_DENIED');
 const orders=plan.stories.filter(s=>s.decision==='SELECT').map(s=>s.order);if(new Set(orders).size!==orders.length)throw new HandoffError('SCOPE_DENIED');
 for(const s of plan.stories){const c=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;if(s.targetType!==c.targetType || allRefs(s).some(id=>!c.facts.some(f=>f.id===id))||s.previousLedgerEntryIds.some(id=>!shortlist.ledger.some(e=>e.id===id))||s.correctionObligationIds.some(id=>!c.correctionObligationIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && (s.treatment==='OMIT'||!s.mustIncludeFactIds.length)||s.decision!=='SELECT' && s.treatment!=='OMIT')throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && s.newUnderstandingFactIds.some(id=>!s.mustIncludeFactIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && c.protectedReasons.length){const known=knownFacts(c,shortlist);for(const f of c.facts)if(!known.some(k=>equivalentFact(k,f.text)) && !s.mustIncludeFactIds.includes(f.id))throw new HandoffError('SCOPE_DENIED')}
  if(s.decision==='SUPPRESS' && c.protectedReasons.length && (!c.facts.every(f=>knownFacts(c,shortlist).some(k=>equivalentFact(k,f.text)))||c.correctionObligationIds.length))throw new HandoffError('SCOPE_DENIED');
 }
 const obligations=new Set(plan.obligations.map(o=>o.obligationId));if(obligations.size!==plan.obligations.length||obligations.size!==shortlist.obligations.length||shortlist.obligations.some(o=>!obligations.has(o.id)))throw new HandoffError('SCOPE_DENIED');
 for(const o of plan.obligations)if(o.handling==='ADDRESS'){
  const obligation=shortlist.obligations.find(item=>item.id===o.obligationId)!,story=plan.stories.find(s=>s.decision==='SELECT'&&s.targetVersionId===o.targetVersionId&&s.correctionObligationIds.includes(o.obligationId)),candidate=shortlist.candidates.find(c=>c.targetVersionId===o.targetVersionId),entry=shortlist.ledger.find(e=>e.id===obligation.ledgerEntryId);
  if(!story||!candidate||!entry||!story.previousLedgerEntryIds.includes(entry.id)||!['CORRECTION','CONTRADICTION','RETRACTION','STATE_CHANGE','CERTAINTY_CHANGE'].includes(story.deltaType)||!story.newUnderstandingFactIds.some(id=>candidate.facts.some(f=>f.id===id&&!entry.claimFacts.some(k=>equivalentFact(k,f.text)))))throw new HandoffError('SCOPE_DENIED');
 }return plan;
}
/** Offline construction is explicitly labeled. It preserves exact facts and
 * suspected-repeat flags rather than pretending to be a semantic editor. */
export function fallbackEditorialPlan(shortlist:ShortlistRecord):EditorialPlanBody {
 const stories:PlanStory[]=shortlist.candidates.map((c,order)=>{
  const repeated=c.fallbackEditorial.decision==='SUPPRESS'&&!c.protectedReasons.length,understanding=c.facts.filter(f=>c.fallbackEditorial.newUnderstanding.some(n=>equivalentFact(n.text,f.text))).map(f=>f.id),required=c.protectedReasons.length?c.facts.map(f=>f.id):understanding.length?understanding:c.facts.map(f=>f.id);
  return {targetType:c.targetType,targetVersionId:c.targetVersionId,decision:repeated?'SUPPRESS':'SELECT',order,treatment:repeated?'OMIT':c.fallbackEditorial.treatment==='OMIT'?'STANDARD':c.fallbackEditorial.treatment,deltaType:repeated?'REPEAT':c.effects.includes('CONTRADICTS')?'CONTRADICTION':c.effects.includes('RETRACTS')?'RETRACTION':c.effects.includes('CHANGES_CERTAINTY')?'CERTAINTY_CHANGE':c.effects.includes('CHANGES_STATE')?'STATE_CHANGE':'NEW',newUnderstandingFactIds:understanding,contextFactIds:[],mustIncludeFactIds:repeated?[]:required,attributionFactIds:c.facts.filter(f=>f.attribution).map(f=>f.id),certaintyFactIds:c.facts.filter(f=>f.certainty?.hedges.length).map(f=>f.id),disagreementFactIds:c.effects.includes('CONTRADICTS')?required:[],openQuestionFactIds:[],correctionObligationIds:c.correctionObligationIds,previousLedgerEntryIds:shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)).map(e=>e.id),rationale:repeated?'Conservative exact communicated-fact repetition.':'Deterministic fallback: preserve supported information for the writer.',relevanceRationale:'Feed-scoped approved evidence; no semantic relevance claim.'};
 });
 // Correction obligations need an explicit supported editorial decision. A
 // fallback cannot infer that publishing the same news corrects a withdrawal.
 return {stories,obligations:shortlist.obligations.map(o=>({obligationId:o.id,handling:'DEFER',targetVersionId:null,reason:'Awaiting a supported comparative correction decision.'}))};
}
const string={type:'string'},idArray={type:'array',maxItems:100,items:string},object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const editorialPlanWireSchema=object({stories:{type:'array',maxItems:100,items:object({targetType:{type:'string',enum:['EVENT','STORYLINE']},targetVersionId:string,decision:{type:'string',enum:['SELECT','SUPPRESS','DEFER']},order:{type:'integer',minimum:0},treatment:{type:'string',enum:['OMIT','BRIEF','STANDARD','DETAILED']},deltaType:{type:'string',enum:['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']},newUnderstandingFactIds:idArray,contextFactIds:idArray,mustIncludeFactIds:idArray,attributionFactIds:idArray,certaintyFactIds:idArray,disagreementFactIds:idArray,openQuestionFactIds:idArray,correctionObligationIds:idArray,previousLedgerEntryIds:idArray,rationale:string,relevanceRationale:string})},obligations:{type:'array',maxItems:100,items:object({obligationId:string,handling:{type:'string',enum:['ADDRESS','DEFER']},targetVersionId:{type:['string','null']},reason:string})}});
export async function prepareEditorialPlan(store:V1FeedStore,shortlist:ShortlistRecord,budget:BriefingBudget,now:string,strong?:StrongSemanticModel):Promise<EditorialPlanRecord> {
 const id=await sha256(canonicalJson({feedId:shortlist.feedId,shortlistId:shortlist.id,budget,model:strong?.model??'NONE',policy:EDITORIAL_PLAN_POLICY}));
 const prior=await store.read<EditorialPlanRecord>(shortlist.feedId,'editorial_plans',id);if(prior)return prior;
 let body=fallbackEditorialPlan(shortlist),route:EditorialPlanRecord['route']='DETERMINISTIC_FALLBACK',fallbackReason=strong?'EMPTY_OR_OVERSIZED_EDITORIAL_INPUT':'STRONG_MODEL_UNAVAILABLE',operationId:string|undefined;
 const feed=await store.getFeed(shortlist.feedId),state={instruction:'Make one comparative editorial decision for this whole Feed/window using supplied shortlist, exact supported facts and what the reader actually saw. Scores/flags are hints. Decide every target, selection/order, BRIEF/STANDARD/DETAILED, semantic delta, MUST_INCLUDE fact IDs, attribution/certainty/disagreement/open questions and correction obligations. Do not drop protected changed state/certainty/contradictions/corrections/retractions via cheap thresholds. Never invent facts or references, manufacture consensus or claim unknown outcomes are resolved. If support or hard capacity is insufficient DEFER explicitly. Suppression of protected information requires exact already-communicated support. For selected stories every newUnderstandingFactId must be MUST_INCLUDE. Addressing a correction requires a supported new fact, the affected earlier ledger reference and explicit reader-visible correction treatment; otherwise DEFER. The writer cannot choose stories.',feed:feed?{title:feed.title,interests:feed.interests,geography:feed.geography,outputLanguage:feed.outputLanguage}:undefined,window:shortlist.window,budget,ledger:shortlist.ledger,candidates:shortlist.candidates,obligations:shortlist.obligations};
 if(strong&&shortlist.evidenceRevisionIds.length&&new TextEncoder().encode(canonicalJson(state)).length<=48000){
  const saved=await durableSemanticOperation(store,{feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state},async()=>{const result=await strong.complete(shortlist.feedId,'COMPARATIVE_EDITORIAL_PLAN',state,editorialPlanWireSchema);return {value:validateEditorialPlan(result.value as EditorialPlanBody,shortlist),usage:result.usage}},now,()=>strong.usage());
  operationId=saved.id;if(saved.status==='SUCCEEDED'&&saved.value){body=saved.value;route='GPT';fallbackReason=undefined as any}else fallbackReason=saved.failure??'EDITORIAL_DEFERRED';
 }
 let selected=0;body={...body,stories:body.stories.map(s=>({...s})).sort((a,b)=>a.order-b.order)};
 for(const s of body.stories)if(s.decision==='SELECT'&&selected++>=budget.maxStories){s.decision='DEFER';s.treatment='OMIT';s.rationale='Explicit hard story budget deferral; retained for a later window.'}
 for(const o of body.obligations)if(o.handling==='ADDRESS'&&!body.stories.some(s=>s.decision==='SELECT'&&s.targetVersionId===o.targetVersionId)){o.handling='DEFER';o.reason='Supported target deferred by hard story capacity.'}
 validateEditorialPlan(body,shortlist);
 return feedTransact(store,shortlist.feedId,async tx=>{
  if(tx.snapshot.feed.revision!==shortlist.feedRevision || await communicationFingerprint(tx,shortlist.window.end)!==shortlist.communicationFingerprint)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  const existing=await tx.read<EditorialPlanRecord>('editorial_plans',id);if(existing)return existing;
  const value:EditorialPlanRecord={id,feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route,operationId,fallbackReason,evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:EDITORIAL_PLAN_POLICY,createdAt:now,...body};await tx.write('editorial_plans',id,value);
  for(const story of body.stories.filter(s=>s.decision==='DEFER')){const c=shortlist.candidates.find(c=>c.targetVersionId===story.targetVersionId)!;if(c.protectedReasons.length){const workId=JSON.stringify([id,story.targetVersionId]);await tx.write('editorial_deferred_work',workId,{id:workId,feedId:shortlist.feedId,planId:id,targetVersionId:story.targetVersionId,stableTargetId:c.stableTargetId,storylineId:c.storylineId,protectedReasons:c.protectedReasons,reason:story.rationale,createdAt:now})}}
  return value;
 });
}
