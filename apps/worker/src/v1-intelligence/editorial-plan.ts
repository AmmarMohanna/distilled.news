import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore} from './store';
import {communicationFingerprint,equivalentFact} from './editorial';
import {durableSemanticOperation} from './semantic-operations';
import type {StrongSemanticModel} from './semantic-model';
import type {ShortlistRecord,ShortlistCandidate} from './shortlist';
import type {BriefingBudget} from './scoring';
import {compactEditorialInput} from './editorial-transport';
export const EDITORIAL_PLAN_POLICY='comparative-editorial-plan-v13';
const ids=z.array(z.string().min(1)).max(100);
export const planStorySchema=z.object({targetType:z.enum(['EVENT','STORYLINE']),targetVersionId:z.string().min(1),decision:z.enum(['SELECT','SUPPRESS','DEFER']),order:z.number().int().nonnegative(),treatment:z.enum(['OMIT','BRIEF','STANDARD','DETAILED']),deltaType:z.enum(['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']),newUnderstandingFactIds:ids,contextFactIds:ids,mustIncludeFactIds:ids,attributionFactIds:ids,certaintyFactIds:ids,disagreementFactIds:ids,openQuestionFactIds:ids,correctionObligationIds:ids,previousLedgerEntryIds:ids,rationale:z.string().min(1).max(600),relevanceRationale:z.string().min(1).max(600)}).strict();
export type PlanStory=z.infer<typeof planStorySchema>;
const obligationSchema=z.object({obligationId:z.string(),handling:z.enum(['ADDRESS','DEFER']),targetVersionId:z.string().nullable(),reason:z.string().min(1).max(600)}).strict();
export const planBodySchema=z.object({stories:z.array(planStorySchema).max(100),obligations:z.array(obligationSchema).max(100)}).strict();
export type EditorialPlanBody=z.infer<typeof planBodySchema>;
export interface EditorialPlanRecord extends EditorialPlanBody {id:string;feedId:string;feedRevision:number;shortlistId:string;window:ShortlistRecord['window'];communicationFingerprint:string;route:'GPT'|'DETERMINISTIC_FALLBACK';operationId?:string;fallbackReason?:string;evidenceRevisionIds:string[];policyVersion:string;createdAt:string}
const allRefs=(s:PlanStory)=>[...s.newUnderstandingFactIds,...s.contextFactIds,...s.mustIncludeFactIds,...s.attributionFactIds,...s.certaintyFactIds,...s.disagreementFactIds,...s.openQuestionFactIds];
function knownFacts(c:ShortlistCandidate,shortlist:ShortlistRecord):string[]{return shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||c.storylineId && e.storylineIds?.includes(c.storylineId)).flatMap(e=>e.claimFacts)}
export function publicationCorrectionReady(c:Pick<ShortlistCandidate,'facts'|'correctionObligationIds'>,obligations:ShortlistRecord['obligations']):boolean {
 return c.facts.length>0&&c.facts.every(f=>f.selfContained==='YES'||f.selfContained==='RESOLVED_BY_CONTEXT')&&c.correctionObligationIds.length>0&&c.correctionObligationIds.every(id=>obligations.some(o=>o.id===id&&o.publicationWithdrawal));
}
export function validateEditorialPlan(raw:EditorialPlanBody,shortlist:ShortlistRecord,options:{requirePublicationCorrection?:boolean}={}):EditorialPlanBody {
 const plan=planBodySchema.parse(raw),targets=new Set(plan.stories.map(s=>s.targetVersionId));
 if(targets.size!==plan.stories.length||targets.size!==shortlist.candidates.length||shortlist.candidates.some(c=>!targets.has(c.targetVersionId)))throw new HandoffError('SCOPE_DENIED');
 const orders=plan.stories.filter(s=>s.decision==='SELECT').map(s=>s.order);if(new Set(orders).size!==orders.length)throw new HandoffError('SCOPE_DENIED');
 for(const s of plan.stories){const c=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;if(s.targetType!==c.targetType || allRefs(s).some(id=>!c.facts.some(f=>f.id===id))||s.previousLedgerEntryIds.some(id=>!shortlist.ledger.some(e=>e.id===id))||s.correctionObligationIds.some(id=>!c.correctionObligationIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  if(options.requirePublicationCorrection&&publicationCorrectionReady(c,shortlist.obligations)&&(s.decision!=='SELECT'||!['CORRECTION','RETRACTION'].includes(s.deltaType)))throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && (s.treatment==='OMIT'||!s.mustIncludeFactIds.length)||s.decision!=='SELECT' && s.treatment!=='OMIT')throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && s.newUnderstandingFactIds.some(id=>!s.mustIncludeFactIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && c.protectedReasons.length){const known=knownFacts(c,shortlist);for(const f of c.facts)if(!known.some(k=>equivalentFact(k,f.text)) && !s.mustIncludeFactIds.includes(f.id))throw new HandoffError('SCOPE_DENIED')}
  if(s.decision==='SUPPRESS' && c.protectedReasons.length && (!c.facts.every(f=>knownFacts(c,shortlist).some(k=>equivalentFact(k,f.text)))||c.correctionObligationIds.length))throw new HandoffError('SCOPE_DENIED');
 }
 const obligations=new Set(plan.obligations.map(o=>o.obligationId));if(obligations.size!==plan.obligations.length||obligations.size!==shortlist.obligations.length||shortlist.obligations.some(o=>!obligations.has(o.id)))throw new HandoffError('SCOPE_DENIED');
 for(const o of plan.obligations)if(o.handling==='ADDRESS'){
  const obligation=shortlist.obligations.find(item=>item.id===o.obligationId)!,story=plan.stories.find(s=>s.decision==='SELECT'&&s.targetVersionId===o.targetVersionId&&s.correctionObligationIds.includes(o.obligationId)),candidate=shortlist.candidates.find(c=>c.targetVersionId===o.targetVersionId),entry=shortlist.ledger.find(e=>e.id===obligation.ledgerEntryId);
  // Correcting withdrawn reader prose need not invent a new source development.
  // Only a persisted publication withdrawal permits this exception; source
  // retractions/deletions still require changed supported understanding.
  const correctiveRestatement=obligation.publicationWithdrawal&&['CORRECTION','RETRACTION'].includes(story?.deltaType??'')&&story?.mustIncludeFactIds.some(id=>candidate?.facts.some(f=>f.id===id));
  if(!story||!candidate||!entry||!story.previousLedgerEntryIds.includes(entry.id)||!['CORRECTION','CONTRADICTION','RETRACTION','STATE_CHANGE','CERTAINTY_CHANGE'].includes(story.deltaType)||!correctiveRestatement&&!story.newUnderstandingFactIds.some(id=>candidate.facts.some(f=>f.id===id&&!entry.claimFacts.some(k=>equivalentFact(k,f.text)))))throw new HandoffError('SCOPE_DENIED');
 }
 // Reasserting a withdrawn/corrected target while deferring its obligation is
 // not corrective communication. Defer the target until it can be addressed.
 for(const story of plan.stories.filter(s=>s.decision==='SELECT')){
  const candidate=shortlist.candidates.find(c=>c.targetVersionId===story.targetVersionId)!;
  if(candidate.correctionObligationIds.some(id=>!plan.obligations.some(o=>o.obligationId===id&&o.handling==='ADDRESS'&&o.targetVersionId===story.targetVersionId)))throw new HandoffError('SCOPE_DENIED');
 }
 return plan;
}
/** Offline construction is explicitly labeled. It preserves exact facts and
 * suspected-repeat flags rather than pretending to be a semantic editor. */
export function fallbackEditorialPlan(shortlist:ShortlistRecord):EditorialPlanBody {
 // Protected deltas first, then by priority; old-source reporting ranks below genuine developments of the window.
 const old=(i:number)=>shortlist.candidates[i].flags.includes('OLD_RECAP')&&!shortlist.candidates[i].protectedReasons.length,ranked=[...shortlist.candidates.keys()].sort((a,b)=>Number(old(a))-Number(old(b))||shortlist.candidates[b].protectedReasons.length-shortlist.candidates[a].protectedReasons.length||shortlist.candidates[b].priority-shortlist.candidates[a].priority||a-b);
 const stories:PlanStory[]=shortlist.candidates.map((c,index)=>{
  const order=ranked.indexOf(index);
  const repeated=c.fallbackEditorial.decision==='SUPPRESS'&&!c.protectedReasons.length&&!c.correctionObligationIds.length,understanding=c.facts.filter(f=>c.fallbackEditorial.newUnderstanding.some(n=>equivalentFact(n.text,f.text))).map(f=>f.id),required=c.protectedReasons.length?c.facts.map(f=>f.id):understanding.length?understanding:c.facts.map(f=>f.id);
  // A non-protected fact whose referent cannot be established from permitted evidence is never invented around: drop it, and defer a story with nothing self-contained left.
  const unresolved=new Set(c.protectedReasons.length?[]:c.facts.filter(f=>f.selfContained==='UNRESOLVED').map(f=>f.id)),keep=(l:string[])=>l.filter(id=>!unresolved.has(id)),kept=keep(required),incomplete=c.correctionObligationIds.length>0||!repeated&&unresolved.size>0&&!kept.length;
  return {targetType:c.targetType,targetVersionId:c.targetVersionId,decision:repeated?'SUPPRESS':incomplete?'DEFER':'SELECT',order,treatment:repeated||incomplete?'OMIT':c.fallbackEditorial.treatment==='OMIT'?'STANDARD':c.fallbackEditorial.treatment,deltaType:repeated?'REPEAT':incomplete?'UNRESOLVED':c.effects.includes('CONTRADICTS')?'CONTRADICTION':c.effects.includes('RETRACTS')?'RETRACTION':c.effects.includes('CHANGES_CERTAINTY')?'CERTAINTY_CHANGE':c.effects.includes('CHANGES_STATE')?'STATE_CHANGE':'NEW',newUnderstandingFactIds:keep(understanding),contextFactIds:[],mustIncludeFactIds:repeated||incomplete?[]:kept,attributionFactIds:c.facts.filter(f=>f.attribution).map(f=>f.id),certaintyFactIds:c.facts.filter(f=>f.certainty?.hedges.length).map(f=>f.id),disagreementFactIds:c.effects.includes('CONTRADICTS')?required:[],openQuestionFactIds:[],correctionObligationIds:c.correctionObligationIds,previousLedgerEntryIds:shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)).map(e=>e.id),rationale:repeated?'Conservative exact communicated-fact repetition.':'Deterministic fallback: preserve supported information for the writer.',relevanceRationale:'Feed-scoped approved evidence; no semantic relevance claim.'};
 });
 // Correction obligations need an explicit supported editorial decision. A
 // fallback cannot infer that publishing the same news corrects a withdrawal.
 return {stories,obligations:shortlist.obligations.map(o=>({obligationId:o.id,handling:'DEFER',targetVersionId:null,reason:'Awaiting a supported comparative correction decision.'}))};
}
const string={type:'string'},idArray={type:'array',maxItems:100,items:string},object=<T extends Record<string,unknown>>(properties:T)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const baseEditorialPlanWireSchema=object({stories:{type:'array',maxItems:100,items:object({targetType:{type:'string',enum:['EVENT','STORYLINE']},targetVersionId:string,decision:{type:'string',enum:['SELECT','SUPPRESS','DEFER']},order:{type:'integer',minimum:0},treatment:{type:'string',enum:['OMIT','BRIEF','STANDARD','DETAILED']},deltaType:{type:'string',enum:['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']},newUnderstandingFactIds:idArray,contextFactIds:idArray,mustIncludeFactIds:idArray,attributionFactIds:idArray,certaintyFactIds:idArray,disagreementFactIds:idArray,openQuestionFactIds:idArray,correctionObligationIds:idArray,previousLedgerEntryIds:idArray,rationale:string,relevanceRationale:string})},obligations:{type:'array',maxItems:100,items:object({obligationId:string,handling:{type:'string',enum:['ADDRESS','DEFER']},targetVersionId:{type:['string','null']},reason:string})}});
// Encode the existing decision/treatment invariant in the provider schema,
// rather than accepting a billed DEFER+BRIEF response or coercing it afterward.
const storyWire=baseEditorialPlanWireSchema.properties.stories.items;
export const editorialPlanWireSchema={...baseEditorialPlanWireSchema,properties:{...baseEditorialPlanWireSchema.properties,stories:{...baseEditorialPlanWireSchema.properties.stories,items:{anyOf:[
 {...storyWire,properties:{...storyWire.properties,decision:{type:'string',enum:['SELECT']},treatment:{type:'string',enum:['BRIEF','STANDARD','DETAILED']},mustIncludeFactIds:{...idArray,minItems:1}}},
 {...storyWire,properties:{...storyWire.properties,decision:{type:'string',enum:['SUPPRESS','DEFER']},treatment:{type:'string',enum:['OMIT']}}}
]}}}};
/** Request-local reference categories are capabilities. Ledger handles cannot
 * be used as approved facts, even though both use compact R identifiers. */
export function editorialPlanWireSchemaFor(state:ReturnType<typeof compactEditorialInput>['state']) {
 const schema=structuredClone(editorialPlanWireSchema);
 const refs=(values:string[],minimum=0)=>values.length?{type:'array',minItems:minimum,maxItems:100,items:{type:'string',enum:[...new Set(values)]}}:{type:'array',maxItems:0,items:{type:'string'}};
 const factIds=state.candidates.flatMap(c=>c.facts.map(f=>f.id)),ledgerIds=state.ledger.map(e=>e.id),obligationIds=state.obligations.map(o=>o.id),targets=state.candidates.map(c=>c.targetVersionId);
 Object.assign(schema.properties.stories,{minItems:targets.length,maxItems:targets.length});
 for(const branch of schema.properties.stories.items.anyOf){
  const p=branch.properties as Record<string,unknown>;
  p.targetVersionId={type:'string',enum:targets};
  for(const field of ['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'])p[field]=refs(factIds,field==='mustIncludeFactIds'&&branch.properties.decision.enum[0]==='SELECT'?1:0);
  p.previousLedgerEntryIds=refs(ledgerIds);p.correctionObligationIds=refs(obligationIds);
 }
 const obligations=schema.properties.obligations as unknown as Record<string,unknown>;
 obligations.minItems=obligationIds.length;obligations.maxItems=obligationIds.length;
 if(!obligationIds.length)obligations.maxItems=0;
 else {const p=schema.properties.obligations.items.properties as Record<string,unknown>;p.obligationId={type:'string',enum:obligationIds};p.targetVersionId={type:['string','null'],enum:[...targets,null]};}
 // Supported withdrawals are mandatory reader repair work. The real planner
 // still chooses comparative order; downstream capacity may defer delivery.
 schema.properties.stories.items.anyOf=state.candidates.flatMap(c=>{
  const ready=publicationCorrectionReady(c as ShortlistCandidate,state.obligations);
  return schema.properties.stories.items.anyOf.filter(b=>!ready||b.properties.decision.enum[0]==='SELECT').map(b=>{
   const branch=structuredClone(b),p=branch.properties as Record<string,unknown>;p.targetVersionId={type:'string',enum:[c.targetVersionId]};
   p.previousLedgerEntryIds=refs(state.ledger.filter(e=>e.eventIds.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds.includes(c.storylineId))||state.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id)).map(e=>e.id));
   if(ready){p.deltaType={type:'string',enum:['CORRECTION','RETRACTION']};p.correctionObligationIds=refs(c.correctionObligationIds,c.correctionObligationIds.length);}
   return branch;
  });
 });
 if(obligationIds.length){
  const base=structuredClone(schema.properties.obligations.items);
  (schema.properties.obligations as unknown as {items:unknown}).items={anyOf:state.obligations.map(o=>{
   const candidate=state.candidates.find(c=>c.correctionObligationIds.includes(o.id)&&publicationCorrectionReady(c as ShortlistCandidate,state.obligations));
   const branch=structuredClone(base),p=branch.properties as Record<string,unknown>;
   p.obligationId={type:'string',enum:[o.id]};
   if(candidate){p.handling={type:'string',enum:['ADDRESS']};p.targetVersionId={type:'string',enum:[candidate.targetVersionId]};}
   return branch;
  })};
 }
 return schema;
}
export async function prepareEditorialPlan(store:V1FeedStore,shortlist:ShortlistRecord,budget:BriefingBudget,now:string,strong?:StrongSemanticModel):Promise<EditorialPlanRecord> {
 const id=await sha256(canonicalJson({feedId:shortlist.feedId,shortlistId:shortlist.id,budget,model:strong?.model??'NONE',policy:EDITORIAL_PLAN_POLICY}));
 const prior=await store.read<EditorialPlanRecord>(shortlist.feedId,'editorial_plans',id);if(prior)return prior;
 let body=fallbackEditorialPlan(shortlist),route:EditorialPlanRecord['route']='DETERMINISTIC_FALLBACK',fallbackReason=strong?'EMPTY_OR_OVERSIZED_EDITORIAL_INPUT':'STRONG_MODEL_UNAVAILABLE',operationId:string|undefined;
 const feed=await store.getFeed(shortlist.feedId),state={instruction:'Make one comparative editorial decision for this whole Feed/window using supplied shortlist, exact supported facts and what the reader actually saw. Scores/flags are hints. A target flagged OLD_RECAP has source reporting that predates the window: include it only if it still helps the reader understand and was not already communicated, rank it below genuine window developments, and never present it as having just happened. Fact timing distinguishes source publication, observation and event time; source publication is not event time. Old facts can be reader-new even in a first edition, but repeated recaps and corroboration alone normally deserve no story. Continuing stories should lead with the delta from the ledger, keeping only necessary orientation. Omit or defer it when it adds nothing. Decide every target, selection/order, BRIEF/STANDARD/DETAILED, semantic delta, MUST_INCLUDE fact IDs, attribution/certainty/disagreement/open questions and correction obligations. Do not drop protected changed state/certainty/contradictions/corrections/retractions via cheap thresholds. Never invent facts or references, manufacture consensus or claim unknown outcomes are resolved. A publicationWithdrawal obligation means Distilled withdrew its own prior reader prose, not that the source retracted its news. Prior claimText is what readers saw. Correct that communication explicitly with CORRECTION or RETRACTION and supported MUST_INCLUDE facts, even when those facts are unchanged; newUnderstandingFactIds may be empty for this corrective restatement. Do not fabricate a new development or a source retraction. Prioritize these obligations above ordinary stories. If support or hard capacity is insufficient DEFER explicitly. Suppression of protected information requires exact already-communicated support. For selected stories every newUnderstandingFactId must be MUST_INCLUDE. Addressing a source correction requires a supported changed fact; a persisted publicationWithdrawal may use unchanged supported facts to correct prior prose. Both require the affected earlier ledger reference and explicit reader-visible correction treatment; otherwise DEFER the entire affected target, not just the obligation. A SELECT target with open correction obligations must explicitly ADDRESS all of them; never reassert the target while its obligation is deferred. For SELECT use BRIEF, STANDARD or DETAILED and at least one mustIncludeFactId. For SUPPRESS or DEFER treatment MUST be OMIT. contextFactIds may contain only offered facts from that candidate, never ledger IDs. Ledger IDs belong only in previousLedgerEntryIds; ledger prose is reader history, not evidence. Copy the offered request-local reference handles verbatim; do not substitute stableTargetId for targetVersionId. Keep rationale, relevanceRationale and obligation reasons concise (at most 160 characters each). Return one story decision for EVERY candidate, including all DEFER/SUPPRESS candidates. Story and publisher budgets constrain only SELECT decisions, never the number of decisions returned. Open correction obligations and deferred work are tasks to resolve, not automatic reasons to defer. POLICY_REQUIRED is a withdrawal of Distilled reader prose, NOT a prohibition on the source facts and NOT a source retraction. This plan is the correction decision: do not defer a supported correction merely because it has not yet been corrected. That is circular. When approved facts and their context are available, select corrective treatment of at least one affected target within capacity and ADDRESS its obligations, using unchanged supported facts if needed. Explicitly acknowledge the prior Distilled communication was withdrawn and clarify the supported version; never invent the reason for withdrawal. Address supported publication withdrawals first, using prior claimText and approved facts. If capacity prevents all corrections, select the most consequential corrections that fit, explicitly defer the remainder, and do not use those slots for ordinary news instead. For a candidate whose schema requires corrective SELECT, rank and plan its repair now. Publication capacity will defer excess deliveries; do not turn required repair into an endless defer-until-corrected loop. The writer cannot choose stories.',feed:feed?{title:feed.title,interests:feed.interests,geography:feed.geography,outputLanguage:feed.outputLanguage}:undefined,window:shortlist.window,budget,ledger:shortlist.ledger,candidates:shortlist.candidates,obligations:shortlist.obligations};
 const transport=compactEditorialInput(state);
 if(strong&&shortlist.evidenceRevisionIds.length&&new TextEncoder().encode(canonicalJson(state)).length<=48000){
  const saved=await durableSemanticOperation(store,{feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:transport.state},async()=>{const result=await strong.complete(shortlist.feedId,'COMPARATIVE_EDITORIAL_PLAN',transport.state,editorialPlanWireSchemaFor(transport.state));return {value:validateEditorialPlan(transport.decode(planBodySchema.parse(result.value)),shortlist,{requirePublicationCorrection:true}),usage:result.usage}},now,()=>strong.usage());
  operationId=saved.id;if(saved.status==='SUCCEEDED'&&saved.value){body=saved.value;route='GPT';fallbackReason=undefined as any}else fallbackReason=saved.failure??'EDITORIAL_DEFERRED';
 }
 let selected=0;body={...body,stories:body.stories.map(s=>({...s})).sort((a,b)=>a.order-b.order)};
 // Hard capacity is allocated protected-first (changed state/certainty, contradiction, correction, retraction, obligations), then by editorial order:
 // an ordinary story can never displace protected information, however the planner ranked it.
 const protectedTarget=(id:string)=>Boolean(shortlist.candidates.find(c=>c.targetVersionId===id)?.protectedReasons.length),allocation=body.stories.filter(s=>s.decision==='SELECT').sort((a,b)=>Number(protectedTarget(b.targetVersionId))-Number(protectedTarget(a.targetVersionId))||a.order-b.order);
 for(const s of allocation)if(selected++>=budget.maxStories){s.decision='DEFER';s.treatment='OMIT';s.rationale='Explicit hard story budget deferral; retained for a later window.'}
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
