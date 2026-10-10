import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore} from './store';
import {communicationFingerprint,equivalentFact} from './editorial';
import {durableSemanticOperation} from './semantic-operations';
import type {StrongSemanticModel} from './semantic-model';
import type {ShortlistRecord,ShortlistCandidate} from './shortlist';
import type {BriefingBudget} from './scoring';
import {compactEditorialInput,keyedEditorialState,boundedEditorialInput,EDITORIAL_INPUT_POLICY,EDITORIAL_OUTPUT_CONTRACT} from './editorial-transport';
import {compareEditorialCandidates} from './editorial-ranking';
import {planningCapacity,communicationCost,legacyConservativeStoryCapacity,storyCapacityBound,guaranteedStoryCount,allocateFeasibleSelection,capacityReason,selectableForPlanning,type SelectionItem} from './planning-capacity';
import {deferEditorialWork,resolveEditorialWork,BLOCKED_DEFERRAL_REASON,type EditorialWork} from './editorial-work';
export const EDITORIAL_PLAN_POLICY='comparative-editorial-plan-v21';
// Output-contract repair does not change model input, reservations or call identity.
export const EDITORIAL_NORMALIZATION_POLICY='selected-new-facts-required-v1';
export interface EditorialNormalization {policyVersion:string;added:{targetVersionId:string;factIds:string[]}[]}
const ids=z.array(z.string().min(1)).max(100);
export const planStorySchema=z.object({targetType:z.enum(['EVENT','STORYLINE']),targetVersionId:z.string().min(1),decision:z.enum(['SELECT','SUPPRESS','DEFER']),order:z.number().int().nonnegative(),treatment:z.enum(['OMIT','BRIEF','STANDARD','DETAILED']),deltaType:z.enum(['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']),newUnderstandingFactIds:ids,contextFactIds:ids,mustIncludeFactIds:ids,attributionFactIds:ids,certaintyFactIds:ids,disagreementFactIds:ids,openQuestionFactIds:ids,correctionObligationIds:ids,previousLedgerEntryIds:ids,rationale:z.string().min(1).max(600),relevanceRationale:z.string().min(1).max(600),feedFit:z.enum(['DIRECT','CONTEXTUAL','UNCERTAIN','OUT_OF_SCOPE']).optional()}).strict();
export type PlanStory=z.infer<typeof planStorySchema>;
const obligationSchema=z.object({obligationId:z.string(),handling:z.enum(['ADDRESS','DEFER']),targetVersionId:z.string().nullable(),reason:z.string().min(1).max(600)}).strict();
export const planBodySchema=z.object({stories:z.array(planStorySchema).max(100),obligations:z.array(obligationSchema).max(100)}).strict();
export type EditorialPlanBody=z.infer<typeof planBodySchema>;
export interface EditorialPlanRecord extends EditorialPlanBody {id:string;feedId:string;feedRevision:number;shortlistId:string;window:ShortlistRecord['window'];communicationFingerprint:string;route:'GPT'|'DETERMINISTIC_FALLBACK';plannerSource?:'REAL_COMPARATIVE_MODEL'|'DETERMINISTIC_FALLBACK';capacityAdjustments?:{targetVersionId:string;reason:string}[];modelOperationIds?:string[];inputCoverage?:{policyVersion:string;inputBytes:number;offeredTargetVersionIds:string[];notComparativelyReviewedTargetVersionIds:string[]};operationId?:string;fallbackReason?:string;normalization?:EditorialNormalization;recoveredFromPlanId?:string;evidenceRevisionIds:string[];policyVersion:string;createdAt:string}
const allRefs=(s:PlanStory)=>[...s.newUnderstandingFactIds,...s.contextFactIds,...s.mustIncludeFactIds,...s.attributionFactIds,...s.certaintyFactIds,...s.disagreementFactIds,...s.openQuestionFactIds];
function knownFacts(c:ShortlistCandidate,shortlist:ShortlistRecord):string[]{return shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||c.storylineId && e.storylineIds?.includes(c.storylineId)).flatMap(e=>e.claimFacts)}
export function publicationCorrectionReady(c:Pick<ShortlistCandidate,'facts'|'correctionObligationIds'> & {flags?:string[]},obligations:ShortlistRecord['obligations']):boolean {
 return !c.flags?.some(f=>['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'].includes(f))&&c.facts.length>0&&c.facts.every(f=>f.selfContained==='YES'||f.selfContained==='RESOLVED_BY_CONTEXT')&&c.correctionObligationIds.length>0&&c.correctionObligationIds.every(id=>obligations.some(o=>o.id===id&&o.publicationWithdrawal));
}
export function validateEditorialPlan(raw:EditorialPlanBody,shortlist:ShortlistRecord,options:{requirePublicationCorrection?:boolean;correctionCapacity?:number;requireFeedFit?:boolean}={}):EditorialPlanBody {
 const readyTargets=shortlist.candidates.filter(c=>publicationCorrectionReady(c,shortlist.obligations)),correctionCapacity=options.correctionCapacity??Infinity;
 const plan=planBodySchema.parse(raw),targets=new Set(plan.stories.map(s=>s.targetVersionId));
 if(targets.size!==plan.stories.length||targets.size!==shortlist.candidates.length||shortlist.candidates.some(c=>!targets.has(c.targetVersionId)))throw new HandoffError('SCOPE_DENIED');
 const orders=plan.stories.filter(s=>s.decision==='SELECT').map(s=>s.order);if(new Set(orders).size!==orders.length)throw new HandoffError('SCOPE_DENIED');
 for(const s of plan.stories){const c=shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!;if(s.targetType!==c.targetType || allRefs(s).some(id=>!c.facts.some(f=>f.id===id))||s.previousLedgerEntryIds.some(id=>!shortlist.ledger.some(e=>e.id===id))||s.correctionObligationIds.some(id=>!c.correctionObligationIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  const allowedHistory=new Set(shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds?.includes(c.storylineId))||shortlist.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id)).map(e=>e.id));
  if(s.previousLedgerEntryIds.some(id=>!allowedHistory.has(id)))throw new HandoffError('SCOPE_DENIED');
  if(options.requirePublicationCorrection&&readyTargets.length<=correctionCapacity&&publicationCorrectionReady(c,shortlist.obligations)&&(s.decision!=='SELECT'||!['CORRECTION','RETRACTION'].includes(s.deltaType)))throw new HandoffError('SCOPE_DENIED');
  if(options.requireFeedFit&&!s.feedFit)throw Error('EDITORIAL_FEED_FIT_MISSING');
  if(s.decision==='SELECT'&&s.feedFit==='OUT_OF_SCOPE'&&!c.correctionObligationIds.length)throw Error('EDITORIAL_OUT_OF_SCOPE_SELECTION');
  if(s.decision==='SELECT'&&(c.flags.includes('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE')||c.flags.includes('TITLE_EXTRACTION_PENDING')))throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && (s.treatment==='OMIT'||!s.mustIncludeFactIds.length)||s.decision!=='SELECT' && s.treatment!=='OMIT')throw new HandoffError('SCOPE_DENIED');
  if(s.decision==='SELECT' && s.newUnderstandingFactIds.some(id=>!s.mustIncludeFactIds.includes(id)))throw new HandoffError('SCOPE_DENIED');
  if(s.deltaType==='REPEAT'&&!c.facts.every(f=>knownFacts(c,shortlist).some(text=>equivalentFact(text,f.text))))throw new HandoffError('SCOPE_DENIED');
  // A source refresh cannot manufacture reader novelty or a correction. Only a
  // persisted publication withdrawal permits corrective supported restatement.
  if(s.decision==='SELECT'){const known=knownFacts(c,shortlist),withdrawal=c.correctionObligationIds.some(id=>shortlist.obligations.some(o=>o.id===id&&o.publicationWithdrawal));if(known.length&&!withdrawal&&!s.newUnderstandingFactIds.some(id=>c.facts.some(f=>f.id===id&&!known.some(text=>equivalentFact(text,f.text)))))throw new HandoffError('SCOPE_DENIED')}
  if(s.decision==='SELECT' && c.protectedReasons.length){const known=knownFacts(c,shortlist);for(const f of c.facts)if(!known.some(k=>equivalentFact(k,f.text)) && !s.mustIncludeFactIds.includes(f.id))throw new HandoffError('SCOPE_DENIED')}
  if(s.decision==='SUPPRESS' && c.protectedReasons.length && (!c.facts.every(f=>knownFacts(c,shortlist).some(k=>equivalentFact(k,f.text)))||c.correctionObligationIds.length))throw new HandoffError('SCOPE_DENIED');
 }
 if(options.requirePublicationCorrection&&readyTargets.length>correctionCapacity&&plan.stories.filter(s=>s.decision==='SELECT'&&readyTargets.some(c=>c.targetVersionId===s.targetVersionId)).length<correctionCapacity)throw new HandoffError('SCOPE_DENIED');
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
/** Only closes a structural omission in the editor's own declared selection.
 * Ownership is checked before promotion; all remaining validation stays authoritative. */
export function normalizeEditorialPlan(raw:EditorialPlanBody,shortlist:ShortlistRecord,options:Parameters<typeof validateEditorialPlan>[2]={}) {
 const body=planBodySchema.parse(raw),normalization:EditorialNormalization={policyVersion:EDITORIAL_NORMALIZATION_POLICY,added:[]};
 for(const story of body.stories.filter(s=>s.decision==='SELECT')){
  const candidate=shortlist.candidates.find(c=>c.targetVersionId===story.targetVersionId);
  if(!candidate||candidate.targetType!==story.targetType||allRefs(story).some(id=>!candidate.facts.some(f=>f.id===id)))throw new HandoffError('SCOPE_DENIED');
  const added=[...new Set(story.newUnderstandingFactIds.filter(id=>!story.mustIncludeFactIds.includes(id)))];
  if(added.length){story.mustIncludeFactIds.push(...added);normalization.added.push({targetVersionId:story.targetVersionId,factIds:added})}
 }
 return {value:validateEditorialPlan(body,shortlist,options),normalization};
}
/** Offline construction is explicitly labeled. It preserves exact facts and
 * suspected-repeat flags rather than pretending to be a semantic editor. */
export function fallbackEditorialPlan(shortlist:ShortlistRecord):EditorialPlanBody {
 // Protected deltas first, then by priority; old-source reporting ranks below genuine developments of the window.
 const old=(i:number)=>shortlist.candidates[i].flags.includes('OLD_RECAP')&&!shortlist.candidates[i].protectedReasons.length,ranked=[...shortlist.candidates.keys()].sort((a,b)=>Number(old(a))-Number(old(b))||shortlist.candidates[b].protectedReasons.length-shortlist.candidates[a].protectedReasons.length||compareEditorialCandidates(shortlist.candidates[a],shortlist.candidates[b]));
 const stories:PlanStory[]=shortlist.candidates.map((c,index)=>{
  const order=ranked.indexOf(index);
  const repeated=c.fallbackEditorial.decision==='SUPPRESS'&&!c.protectedReasons.length&&!c.correctionObligationIds.length,understanding=c.facts.filter(f=>c.fallbackEditorial.newUnderstanding.some(n=>equivalentFact(n.text,f.text))).map(f=>f.id),required=c.protectedReasons.length?c.facts.map(f=>f.id):understanding.length?understanding:c.facts.map(f=>f.id);
  // A non-protected fact whose referent cannot be established from permitted evidence is never invented around: drop it, and defer a story with nothing self-contained left.
  const unresolved=new Set(c.protectedReasons.length?[]:c.facts.filter(f=>f.selfContained==='UNRESOLVED').map(f=>f.id)),keep=(l:string[])=>l.filter(id=>!unresolved.has(id)),kept=keep(required),incomplete=c.flags.includes('TITLE_EXTRACTION_PENDING')||c.flags.includes('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE')||c.correctionObligationIds.length>0||!repeated&&unresolved.size>0&&!kept.length;
  return {targetType:c.targetType,targetVersionId:c.targetVersionId,decision:repeated?'SUPPRESS':incomplete?'DEFER':'SELECT',order,treatment:repeated||incomplete?'OMIT':c.fallbackEditorial.treatment==='OMIT'?'STANDARD':c.fallbackEditorial.treatment,deltaType:repeated?'REPEAT':incomplete?'UNRESOLVED':c.effects.includes('CONTRADICTS')?'CONTRADICTION':c.effects.includes('RETRACTS')?'RETRACTION':c.effects.includes('CHANGES_CERTAINTY')?'CERTAINTY_CHANGE':c.effects.includes('CHANGES_STATE')?'STATE_CHANGE':'NEW',newUnderstandingFactIds:keep(understanding),contextFactIds:[],mustIncludeFactIds:repeated||incomplete?[]:kept,attributionFactIds:c.facts.filter(f=>f.attribution).map(f=>f.id),certaintyFactIds:c.facts.filter(f=>f.certainty?.hedges.length).map(f=>f.id),disagreementFactIds:c.effects.includes('CONTRADICTS')?required:[],openQuestionFactIds:[],correctionObligationIds:c.correctionObligationIds,previousLedgerEntryIds:shortlist.ledger.filter(e=>e.eventIds?.includes(c.stableTargetId)).map(e=>e.id),rationale:repeated?'Conservative exact communicated-fact repetition.':'Deterministic fallback: preserve supported information for the writer.',relevanceRationale:'Feed-scoped approved evidence; no semantic relevance claim.',feedFit:'UNCERTAIN'};
 });
 // Correction obligations need an explicit supported editorial decision. A
 // fallback cannot infer that publishing the same news corrects a withdrawal.
 return {stories,obligations:shortlist.obligations.map(o=>({obligationId:o.id,handling:'DEFER',targetVersionId:null,reason:'Awaiting a supported comparative correction decision.'}))};
}
const string={type:'string'},idArray={type:'array',maxItems:100,items:string},object=<T extends Record<string,unknown>>(properties:T)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const baseEditorialPlanWireSchema=object({stories:{type:'array',maxItems:100,items:object({targetType:{type:'string',enum:['EVENT','STORYLINE']},targetVersionId:string,decision:{type:'string',enum:['SELECT','SUPPRESS','DEFER']},order:{type:'integer',minimum:0},treatment:{type:'string',enum:['OMIT','BRIEF','STANDARD','DETAILED']},deltaType:{type:'string',enum:['NEW','STATE_CHANGE','CERTAINTY_CHANGE','CONTRADICTION','CORRECTION','RETRACTION','DETAIL','REPEAT','UNRESOLVED']},newUnderstandingFactIds:idArray,contextFactIds:idArray,mustIncludeFactIds:idArray,attributionFactIds:idArray,certaintyFactIds:idArray,disagreementFactIds:idArray,openQuestionFactIds:idArray,correctionObligationIds:idArray,previousLedgerEntryIds:idArray,rationale:string,relevanceRationale:string,feedFit:{type:'string',enum:['DIRECT','CONTEXTUAL','UNCERTAIN','OUT_OF_SCOPE']}})},obligations:{type:'array',maxItems:100,items:object({obligationId:string,handling:{type:'string',enum:['ADDRESS','DEFER']},targetVersionId:{type:['string','null']},reason:string})}});
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
 const sharedBranches=structuredClone(schema.properties.stories.items.anyOf),readyCandidates=state.candidates.filter(c=>publicationCorrectionReady(c as ShortlistCandidate,state.obligations)),blockedCandidates=state.candidates.filter(c=>c.flags.some(f=>['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'].includes(f))),ordinaryTargets=state.candidates.filter(c=>!readyCandidates.includes(c)&&!blockedCandidates.includes(c)).map(c=>c.targetVersionId);
 // Ordinary targets share one decision schema. Expanding the same global fact
 // enum into two branches PER target inflated a 20-item request to 43k tokens.
 // Exact candidate ownership is still enforced by validateEditorialPlan before
 // any plan is persisted or any writer runs. Mandatory correction capabilities
 // retain their individual schema branches.
 const historyFor=(c:ShortlistCandidate)=>state.ledger.filter(e=>e.eventIds.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds.includes(c.storylineId))||state.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id)).map(e=>e.id);
 const withoutHistory=state.candidates.filter(c=>ordinaryTargets.includes(c.targetVersionId)&&!historyFor(c).length),withHistory=state.candidates.filter(c=>ordinaryTargets.includes(c.targetVersionId)&&historyFor(c).length);
 const ordinaryBranches:typeof sharedBranches=withoutHistory.length?sharedBranches.map(b=>({...b,properties:{...b.properties,targetVersionId:{type:'string',enum:withoutHistory.map(c=>c.targetVersionId)},previousLedgerEntryIds:refs([])}})):[];
 for(const c of withHistory)for(const b of sharedBranches){const branch=structuredClone(b),p=branch.properties as Record<string,unknown>;p.targetVersionId={type:'string',enum:[c.targetVersionId]};p.previousLedgerEntryIds=refs(historyFor(c));for(const field of ['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'])p[field]=refs(c.facts.map(f=>f.id),field==='mustIncludeFactIds'&&b.properties.decision.enum[0]==='SELECT'?1:0);ordinaryBranches.push(branch)}
 const allowCorrectionDeferral=readyCandidates.length>((state as unknown as {communicationCapacity?:{maxStories:number}}).communicationCapacity?.maxStories??Infinity);
 const correctionBranches=readyCandidates.flatMap(c=>{
  const branch=structuredClone(sharedBranches[0]),p=branch.properties as Record<string,unknown>;
  p.targetVersionId={type:'string',enum:[c.targetVersionId]};p.deltaType={type:'string',enum:['CORRECTION','RETRACTION']};
  for(const field of ['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'])p[field]=refs(c.facts.map(f=>f.id),field==='mustIncludeFactIds'?1:0);
  p.previousLedgerEntryIds=refs(state.ledger.filter(e=>e.eventIds.includes(c.stableTargetId)||Boolean(c.storylineId&&e.storylineIds.includes(c.storylineId))||state.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id)).map(e=>e.id));
  p.correctionObligationIds=refs(c.correctionObligationIds,c.correctionObligationIds.length);
  if(!allowCorrectionDeferral)return [branch];
  const deferred=structuredClone(sharedBranches[1]),dp=deferred.properties as Record<string,unknown>;dp.targetVersionId={type:'string',enum:[c.targetVersionId]};dp.decision={type:'string',enum:['DEFER']};return [branch,deferred];
 });
 const blockedBranches=blockedCandidates.map(c=>{
  const branch=structuredClone(sharedBranches[1]),p=branch.properties as Record<string,unknown>;
  p.targetVersionId={type:'string',enum:[c.targetVersionId]};p.decision={type:'string',enum:['DEFER']};p.previousLedgerEntryIds=refs(historyFor(c));
  for(const field of ['newUnderstandingFactIds','contextFactIds','mustIncludeFactIds','attributionFactIds','certaintyFactIds','disagreementFactIds','openQuestionFactIds'])p[field]=refs(c.facts.map(f=>f.id));
  p.correctionObligationIds=refs(c.correctionObligationIds);return branch;
 });
 schema.properties.stories.items.anyOf=[...ordinaryBranches,...correctionBranches,...blockedBranches];
 if(obligationIds.length){
  const base=structuredClone(schema.properties.obligations.items);
  (schema.properties.obligations as unknown as {items:unknown}).items={anyOf:state.obligations.map(o=>{
   const candidate=state.candidates.find(c=>c.correctionObligationIds.includes(o.id)&&publicationCorrectionReady(c as ShortlistCandidate,state.obligations));
   const branch=structuredClone(base),p=branch.properties as Record<string,unknown>;
   p.obligationId={type:'string',enum:[o.id]};
   if(candidate&&!allowCorrectionDeferral){p.handling={type:'string',enum:['ADDRESS']};p.targetVersionId={type:'string',enum:[candidate.targetVersionId]};}
   return branch;
  })};
 }
 return schema;
}
export {EDITORIAL_OUTPUT_CONTRACT} from './editorial-transport';
/** Required request-local keys make coverage structural. Shared definitions
 * avoid repeating the full decision schema for every candidate. Ownership and
 * all semantic/capacity guards remain authoritative after decoding. */
export function keyedEditorialPlanWireSchemaFor(state:ReturnType<typeof compactEditorialInput>['state']) {
 const legacy=editorialPlanWireSchemaFor(state),definitions:Record<string,unknown>={},byValue=new Map<string,string>();
 const reference=(raw:unknown,identity:string)=>{
  const branch=structuredClone(raw) as {properties:Record<string,unknown>;required:string[]};
  delete branch.properties[identity];branch.required=branch.required.filter(k=>k!==identity);
  const signature=canonicalJson(branch);let key=byValue.get(signature);if(!key){key=`D${byValue.size}`;byValue.set(signature,key);definitions[key]=branch}
  return {$ref:`#/$defs/${key}`};
 };
 const stories=Object.fromEntries(state.candidates.map(c=>[c.targetVersionId,{anyOf:legacy.properties.stories.items.anyOf.filter(b=>(b.properties.targetVersionId as unknown as {enum:string[]}).enum.includes(c.targetVersionId)).map(b=>reference(b,'targetVersionId'))}]));
 const obligationItems=legacy.properties.obligations.items as unknown as {anyOf?:{properties:{obligationId:{enum:string[]}}}[]};
 const obligations=Object.fromEntries(state.obligations.map(o=>[o.id,{anyOf:(obligationItems.anyOf??[]).filter(b=>b.properties.obligationId.enum.includes(o.id)).map(b=>reference(b,'obligationId'))}]));
 return {...object({stories:object(stories),obligations:object(obligations)}),$defs:definitions};
}
/** The editor must submit a feasible plan; a known, valid but oversized proposal
 * gets at most one comparative repair, never a silent downstream truncation. */
const selectionItem=(s:PlanStory,c:ShortlistCandidate):SelectionItem=>({id:s.targetVersionId,cost:c.communicationCost??communicationCost(c),treatment:s.treatment==='OMIT'?'BRIEF':s.treatment,publisherIds:c.publisherIds??[],protectedItem:c.protectedReasons.length>0,order:s.order,value:c.ranking?.score??c.priority});
/** Same admission rule as allocation, applied to the planner's own order (protected first): a proposal that fits is never rewritten. */
export function planCapacityFailures(body:EditorialPlanBody,shortlist:ShortlistRecord,budget:BriefingBudget){
 const usage={stories:0,input:0,evidence:0,words:0,publishers:new Map<string,number>()},failures:{targetVersionId:string;reason:string}[]=[];
 const items=body.stories.filter(s=>s.decision==='SELECT').map(s=>selectionItem(s,shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!)).sort((a,b)=>Number(b.protectedItem)-Number(a.protectedItem)||a.order-b.order);
 for(const item of items){
  const reason=capacityReason(usage,item,budget);
  if(reason)failures.push({targetVersionId:item.id,reason});
  else{usage.stories++;usage.input+=item.cost.inputUnits;usage.evidence+=item.cost.evidenceCount;usage.words+=item.treatment==='DETAILED'?item.cost.detailedWords:item.treatment==='STANDARD'?item.cost.standardWords:item.cost.briefWords;for(const p of new Set(item.publisherIds))usage.publishers.set(p,(usage.publishers.get(p)??0)+1)}
 }
 return failures;
}
/** Appended to the unchanged instruction so the exact legacy instruction (and thus any already-reserved call identity) stays reproducible. */
const CAPACITY_GUIDANCE=' communicationCapacity.maxStories is the most stories that could ever fit together given the actual costs of these candidates: a ceiling and not a target. Pick the combination of candidates that conveys the most important, supported, reader-new understanding within the summed cost, so several cheaper important stories can be worth more than one expensive story, while one or zero is correct when that is all that deserves publication. Never select a weak story to reach the ceiling. Each candidate lists its publisherIds when known; no publisher may supply more than budget.maxPerPublisher selected stories, so prefer the more important story when they collide. Keep distinct developments as separate stories rather than merging unrelated news to save capacity, and do not split one coherent development into repetitive stories.';
export async function prepareEditorialPlan(store:V1FeedStore,shortlist:ShortlistRecord,budget:BriefingBudget,now:string,strong?:StrongSemanticModel):Promise<EditorialPlanRecord> {
 const baseId=await sha256(canonicalJson({feedId:shortlist.feedId,shortlistId:shortlist.id,budget,model:strong?.model??'NONE',policy:EDITORIAL_PLAN_POLICY}));
 const prior=await store.read<EditorialPlanRecord>(shortlist.feedId,'editorial_plans',baseId);
 const recoveryPolicy=prior?.route==='DETERMINISTIC_FALLBACK'&&strong?(prior.fallbackReason==='SEMANTIC_EDITORIAL_VALIDATION_FAILED'?EDITORIAL_NORMALIZATION_POLICY:prior.fallbackReason==='EMPTY_OR_OVERSIZED_EDITORIAL_INPUT'&&!prior.operationId&&!prior.modelOperationIds?.length&&shortlist.candidates.length?EDITORIAL_INPUT_POLICY:undefined):undefined;
 const recoverable=Boolean(recoveryPolicy);
 if(prior&&!recoverable)return prior;
 // Failed plans/results remain immutable. Recovery has a separate identity;
 // a billed response is reused and a never-called plan may acquire its first call.
 const id=recoverable?await sha256(canonicalJson({baseId,normalization:recoveryPolicy})):baseId;
 const recovered= recoverable?await store.read<EditorialPlanRecord>(shortlist.feedId,'editorial_plans',id):undefined;if(recovered)return recovered;
 let body=fallbackEditorialPlan(shortlist),route:EditorialPlanRecord['route']='DETERMINISTIC_FALLBACK',fallbackReason=strong?'EMPTY_OR_OVERSIZED_EDITORIAL_INPUT':'STRONG_MODEL_UNAVAILABLE',operationId:string|undefined;const modelOperationIds:string[]=[];
 let normalization:EditorialNormalization|undefined;
 const correctionCapacity=guaranteedStoryCount(shortlist.candidates.filter(c=>publicationCorrectionReady(c,shortlist.obligations)),budget);
 const feed=await store.getFeed(shortlist.feedId),EDITORIAL_INSTRUCTION='Make one comparative editorial decision for this whole Feed/window using supplied shortlist, exact supported facts and what the reader actually saw. Scores/flags are hints. Classify feedFit for every target: DIRECT supported development within actual Feed interests, CONTEXTUAL supported context needed for those interests or known reader state, UNCERTAIN plausible connection not yet established, OUT_OF_SCOPE no supported connection. relevanceRationale must explain that connection to the supplied Feed interests using approved facts, not generic reader interest. Freshness, public importance, consumer impact, available capacity and unblocked processing do not establish Feed relevance. Do not fill an edition with unrelated news just because relevant targets are deferred. SUPPRESS genuinely OUT_OF_SCOPE ordinary material with NEW delta; retain uncertain relevance without a brittle keyword gate. An empty selection is valid. Corrections to prior reader communication remain mandatory even if outside ordinary scope. A target flagged OLD_RECAP has source reporting that predates the window: include it only if it still helps the reader understand and was not already communicated, rank it below genuine window developments, and never present it as having just happened. Fact timing distinguishes source publication, observation and event time; source publication is not event time. Old facts can be reader-new even in a first edition, but repeated recaps and corroboration alone normally deserve no story. Continuing stories should lead with the delta from the ledger, keeping only necessary orientation. Omit or defer it when it adds nothing. Decide every target, selection/order, BRIEF/STANDARD/DETAILED, semantic delta, MUST_INCLUDE fact IDs, attribution/certainty/disagreement/open questions and correction obligations. Do not drop protected changed state/certainty/contradictions/corrections/retractions via cheap thresholds. Never invent facts or references, manufacture consensus or claim unknown outcomes are resolved. A publicationWithdrawal obligation means Distilled withdrew its own prior reader prose, not that the source retracted its news. Prior claimText is what readers saw. Correct that communication explicitly with CORRECTION or RETRACTION and supported MUST_INCLUDE facts, even when those facts are unchanged; newUnderstandingFactIds may be empty for this corrective restatement. Do not fabricate a new development or a source retraction. Prioritize these obligations above ordinary stories. If support or hard capacity is insufficient DEFER explicitly. Suppression of protected information requires exact already-communicated support. For selected stories every newUnderstandingFactId must be MUST_INCLUDE. Addressing a source correction requires a supported changed fact; a persisted publicationWithdrawal may use unchanged supported facts to correct prior prose. Both require the affected earlier ledger reference and explicit reader-visible correction treatment; otherwise DEFER the entire affected target, not just the obligation. A SELECT target with open correction obligations must explicitly ADDRESS all of them; never reassert the target while its obligation is deferred. For SELECT use BRIEF, STANDARD or DETAILED and at least one mustIncludeFactId. For SUPPRESS or DEFER treatment MUST be OMIT. contextFactIds may contain only offered facts from that candidate, never ledger IDs. Ledger IDs belong only in previousLedgerEntryIds; ledger prose is reader history, not evidence. Copy the offered request-local reference handles verbatim; do not substitute stableTargetId for targetVersionId. Keep rationale, relevanceRationale and obligation reasons concise (at most 160 characters each). Return one story decision for EVERY candidate, including all DEFER/SUPPRESS candidates. Story and publisher budgets constrain only SELECT decisions, never the number of decisions returned. Open correction obligations and deferred work are tasks to resolve, not automatic reasons to defer. POLICY_REQUIRED is a withdrawal of Distilled reader prose, NOT a prohibition on the source facts and NOT a source retraction. This plan is the correction decision: do not defer a supported correction merely because it has not yet been corrected. That is circular. When approved facts and their context are available, select corrective treatment of at least one affected target within capacity and ADDRESS its obligations, using unchanged supported facts if needed. Explicitly acknowledge the prior Distilled communication was withdrawn and clarify the supported version; never invent the reason for withdrawal. Address supported publication withdrawals first, using prior claimText and approved facts. If capacity prevents all corrections, select the most consequential corrections that fit, explicitly defer the remainder, and do not use those slots for ordinary news instead. For a candidate whose schema requires corrective SELECT, rank and plan its repair now. Publication capacity will defer excess deliveries; do not turn required repair into an endless defer-until-corrected loop. The writer cannot choose stories. Compare usefulness for this Feed and reader across ALL candidates: relevance is a signal, not a binary keyword gate. SUPPRESS with NEW delta means an intentional editorial omission; REPEAT means actually communicated information. DEFER means still uncommunicated work. The bootstrap briefing establishes current useful state; old reporting remains explicitly old context. Every candidate offers conservative communicationCost; total selected cost must fit communicationCapacity, including evidence inspections and reader words. Select fewer stories if necessary; use DEFER for capacity and concise explicit reasons. Ordinary carried work is not automatically protected. TITLE_EXTRACTION_PENDING or IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE targets must DEFER until durable reassessment completes; do not SELECT or discard them.';
 // Candidate-specific capacity (modern) vs the former worst-case estimate (legacy). A call already reserved or answered for the legacy input keeps that exact input.
 const stateFor=(modern:boolean)=>{const maxStories=modern?storyCapacityBound(shortlist.candidates,budget):legacyConservativeStoryCapacity(shortlist.candidates,budget);return {instruction:modern?EDITORIAL_INSTRUCTION+CAPACITY_GUIDANCE:EDITORIAL_INSTRUCTION,feed:feed?{title:feed.title,interests:feed.interests,geography:feed.geography,outputLanguage:feed.outputLanguage}:undefined,window:shortlist.window,bootstrap:shortlist.bootstrap,budget:{...budget,maxStories},communicationCapacity:{...planningCapacity(budget),maxStories},ledger:shortlist.ledger,candidates:modern?shortlist.candidates:shortlist.candidates.map(({publisherIds:_,...c})=>c),obligations:shortlist.obligations}};
 const operationIdFor=(inputState:unknown)=>sha256(canonicalJson({feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong?.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:inputState}));
 const legacyState=stateFor(false);let legacyReserved=false;
 if(strong){const legacyTransport=compactEditorialInput(legacyState);for(const candidate of [legacyTransport.state,keyedEditorialState(legacyTransport.state,{compact:false}),boundedEditorialInput(legacyState).inputState]){const opId=await operationIdFor(candidate);if(await store.read(shortlist.feedId,'semantic_intents',opId)||await store.read(shortlist.feedId,'semantic_results',opId)){legacyReserved=true;break}}}
 const state=legacyReserved?legacyState:stateFor(true);
 let transport=compactEditorialInput(state);
 // Never replace an existing call identity (including a lost/unknown result)
 // merely to adopt a new output shape. Old plans and retained normalization
 // continue using their original transport; only never-started calls use v2.
 const legacyOperationId=await sha256(canonicalJson({feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong?.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:transport.state}));
 const legacyStarted=Boolean(prior&&prior.fallbackReason!=='EMPTY_OR_OVERSIZED_EDITORIAL_INPUT'||await store.read(shortlist.feedId,'semantic_intents',legacyOperationId)||await store.read(shortlist.feedId,'semantic_results',legacyOperationId));
 const priorOperation=prior?.operationId?await store.read<{input:{state:{outputContract?:string}}}>(shortlist.feedId,'semantic_intents',prior.operationId):undefined;
 const keyed=priorOperation?.input.state.outputContract===EDITORIAL_OUTPUT_CONTRACT||!legacyStarted;
 // Old keyed intents/results are just as durable as pre-keyed calls. A transport
 // reduction must never acquire a different identity after a call was reserved.
 const oldKeyedState=keyedEditorialState(transport.state,{compact:false});
 const oldKeyedOperationId=keyed?await sha256(canonicalJson({feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong?.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:oldKeyedState})):undefined;
 const oldKeyedStarted=oldKeyedOperationId?Boolean(await store.read(shortlist.feedId,'semantic_intents',oldKeyedOperationId)||await store.read(shortlist.feedId,'semantic_results',oldKeyedOperationId)):false;
 const bounded=keyed&&!oldKeyedStarted?boundedEditorialInput(state):undefined;
 if(bounded)transport=bounded.transport;
 const inputState=keyed?bounded?.inputState??oldKeyedState:transport.state;
 const overflowIds=bounded?.overflowIds??[],offeredShortlist=overflowIds.length?{...shortlist,candidates:shortlist.candidates.filter(c=>!overflowIds.includes(c.targetVersionId))}:shortlist;
 const inputCoverage=bounded?{policyVersion:EDITORIAL_INPUT_POLICY,inputBytes:new TextEncoder().encode(canonicalJson(inputState)).length,offeredTargetVersionIds:bounded.offeredCandidates.map(c=>c.targetVersionId),notComparativelyReviewedTargetVersionIds:overflowIds}:undefined;
 if(bounded?.failure)fallbackReason=bounded.failure;
 const outputSchema=keyed?keyedEditorialPlanWireSchemaFor(transport.state):editorialPlanWireSchemaFor(transport.state);
 const addOverflow=(value:EditorialPlanBody):EditorialPlanBody=>{
  if(!overflowIds.length)return value;
  const firstOrder=Math.max(-1,...value.stories.map(s=>s.order))+1;
  const overflow=fallbackEditorialPlan(shortlist).stories.filter(s=>overflowIds.includes(s.targetVersionId)).map((s,i)=>({...s,decision:'DEFER' as const,treatment:'OMIT' as const,order:firstOrder+i,feedFit:'UNCERTAIN' as const,rationale:'PLANNER_INPUT_OVERFLOW: not comparatively reviewed; retained for a later window.',relevanceRationale:'Not comparatively reviewed due to the bounded planner input.'}));
  const complete={...value,stories:[...value.stories,...overflow]};validateEditorialPlan(complete,shortlist);return complete;
 };
 const decodeProposal=(raw:unknown)=>keyed?planBodySchema.parse(transport.decodeKeyed(raw)):transport.decode(planBodySchema.parse(raw));
 const completeProposal=async(inputState:typeof transport.state|Record<string,unknown>,attempt:string)=>{
  const result=await strong!.complete(shortlist.feedId,'COMPARATIVE_EDITORIAL_PLAN',inputState,outputSchema);let value:EditorialPlanBody|undefined,rejection:string|undefined,outputNormalization:EditorialNormalization|undefined;
  try{const output=normalizeEditorialPlan(decodeProposal(result.value),offeredShortlist,{requirePublicationCorrection:true,correctionCapacity,requireFeedFit:true});value=addOverflow(output.value);outputNormalization=output.normalization;normalization=outputNormalization}catch(error){rejection=error instanceof HandoffError?error.code:error instanceof Error?error.message.slice(0,300):'INVALID_EDITORIAL_PROPOSAL'}
  const proposalId=JSON.stringify([baseId,attempt]);await feedTransact(store,shortlist.feedId,async tx=>{if(tx.snapshot.feed.revision!==shortlist.feedRevision)throw new HandoffError('SCOPE_DENIED');if(!await tx.read('editorial_proposals',proposalId))await tx.write('editorial_proposals',proposalId,{id:proposalId,feedId:shortlist.feedId,shortlistId:shortlist.id,window:shortlist.window,attempt,model:strong!.model,rawProposal:result.value,decodedProposal:value,normalization:outputNormalization,rejection,capacityFailures:value?planCapacityFailures(value,shortlist,budget):undefined,usage:result.usage,createdAt:now})});
  if(!value)throw Error('SEMANTIC_EDITORIAL_VALIDATION_FAILED');return {value,usage:result.usage};
 };
 if(strong&&shortlist.evidenceRevisionIds.length&&new TextEncoder().encode(canonicalJson(inputState)).length<=48000){
  const saved=await durableSemanticOperation(store,{feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY,model:strong.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:inputState},()=>completeProposal(inputState,'INITIAL'),now,()=>strong.usage());
  operationId=saved.id;modelOperationIds.push(saved.id);
  let accepted=saved;
  // A known, billed, schema-valid response may be structurally repaired without
  // reissuing its model call. Unknown outcomes and unrelated failures stay fenced.
  if(saved.status==='DEFERRED'&&saved.failure==='SEMANTIC_EDITORIAL_VALIDATION_FAILED'&&saved.usage.reported&&saved.usage.calls===1){
   const proposal=await store.read<{model:string;shortlistId:string;rawProposal:unknown}> (shortlist.feedId,'editorial_proposals',JSON.stringify([baseId,'INITIAL']));
   if(proposal?.model===strong.model&&proposal.shortlistId===shortlist.id){
    try{
     const output=normalizeEditorialPlan(decodeProposal(proposal.rawProposal),offeredShortlist,{requirePublicationCorrection:true,correctionCapacity,requireFeedFit:true});
     if(!output.normalization.added.length||planCapacityFailures(output.value,shortlist,budget).length)throw Error('SEMANTIC_NORMALIZATION_NOT_RECOVERABLE');
     const recoveryId=JSON.stringify([id,'RETAINED_NORMALIZATION']);
     await feedTransact(store,shortlist.feedId,async tx=>{if(tx.snapshot.feed.revision!==shortlist.feedRevision||await communicationFingerprint(tx,shortlist.window.end)!==shortlist.communicationFingerprint)throw new HandoffError('TEMPORARY_UNAVAILABLE');if(!await tx.read('editorial_proposals',recoveryId))await tx.write('editorial_proposals',recoveryId,{id:recoveryId,feedId:shortlist.feedId,shortlistId:shortlist.id,window:shortlist.window,attempt:'RETAINED_NORMALIZATION',sourceProposalId:JSON.stringify([baseId,'INITIAL']),sourceOperationId:saved.id,decodedProposal:output.value,normalization:output.normalization,usage:{calls:0,costUsd:0,reported:true},createdAt:now})});
     normalization=output.normalization;accepted={...saved,status:'SUCCEEDED',failure:undefined,value:addOverflow(output.value)};
    }catch(error){if(error instanceof HandoffError&&error.code==='TEMPORARY_UNAVAILABLE')throw error;/* Invalid retained response stays rejected. */}
   }
  }
  if(saved.status==='SUCCEEDED'&&saved.value){
   const violations=planCapacityFailures(saved.value,shortlist,budget);
   if(violations.length){
    const repairState={...inputState,previousProposal:keyed?transport.encodeKeyed({...saved.value,stories:saved.value.stories.filter(s=>!overflowIds.includes(s.targetVersionId))}):transport.encode(saved.value),feasibilityFeedback:{violations,instruction:'The previous proposal is NOT publishable because the selected sum exceeds hard capacity. Recompare ALL candidates and choose the most useful feasible subset. Sum each selected communicationCost.inputUnits against communicationCapacity.maxInputUnits. DEFER the remaining useful work. Do not merely change prose or treatment to evade input cost. Preserve protected priorities.'}};
    accepted=await durableSemanticOperation(store,{feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,evidenceRevisionIds:shortlist.evidenceRevisionIds,kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:EDITORIAL_PLAN_POLICY+':feasibility-v1',model:strong.model,budgetKey:`editorial:${shortlist.window.start}:${shortlist.window.end}`,state:repairState},async()=>{const result=await completeProposal(repairState,'FEASIBILITY_REPAIR');if(planCapacityFailures(result.value,shortlist,budget).length)throw Error('SEMANTIC_INFEASIBLE_PLAN');return result},now,()=>strong.usage());
    operationId=accepted.id;modelOperationIds.push(accepted.id);
   }
  }
  if(accepted.status==='SUCCEEDED'&&!normalization){
   const proposal=await store.read<{normalization?:EditorialNormalization}>(shortlist.feedId,'editorial_proposals',JSON.stringify([baseId,accepted.id===saved.id?'INITIAL':'FEASIBILITY_REPAIR']));normalization=proposal?.normalization;
  }
  if(accepted.status==='SUCCEEDED'&&accepted.value){body=accepted.value;route='GPT';fallbackReason=undefined as any}else fallbackReason=accepted.failure??'EDITORIAL_DEFERRED';
 }
 let selected=0;body={...body,stories:body.stories.map(s=>({...s})).sort((a,b)=>a.order-b.order)};
 // Hard capacity is allocated protected-first (changed state/certainty, contradiction, correction, retraction, obligations): an ordinary story can never
 // displace protected information, however the planner ranked it. Ordinary stories then take the most valuable combination that actually fits,
 // not the first-ranked story that happens to leave no room for the rest.
 const capacityAdjustments:{targetVersionId:string;reason:string}[]=[],allocation=allocateFeasibleSelection(body.stories.filter(s=>s.decision==='SELECT').map(s=>selectionItem(s,shortlist.candidates.find(c=>c.targetVersionId===s.targetVersionId)!)),budget);
 for(const s of body.stories.filter(s=>s.decision==='SELECT')){const reason=allocation.rejected.get(s.targetVersionId);
  if(reason){s.decision='DEFER';s.treatment='OMIT';s.rationale=`${reason}: reconsider in a later window.`;capacityAdjustments.push({targetVersionId:s.targetVersionId,reason})}
 }
 for(const o of body.obligations)if(o.handling==='ADDRESS'&&!body.stories.some(s=>s.decision==='SELECT'&&s.targetVersionId===o.targetVersionId)){o.handling='DEFER';o.reason='Supported target deferred by hard story capacity.'}
 validateEditorialPlan(body,shortlist);
 return feedTransact(store,shortlist.feedId,async tx=>{
  if(tx.snapshot.feed.revision!==shortlist.feedRevision || await communicationFingerprint(tx,shortlist.window.end)!==shortlist.communicationFingerprint)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  const existing=await tx.read<EditorialPlanRecord>('editorial_plans',id);if(existing)return existing;
  const value:EditorialPlanRecord={id,feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route,plannerSource:route==='GPT'?'REAL_COMPARATIVE_MODEL':'DETERMINISTIC_FALLBACK',capacityAdjustments,modelOperationIds,inputCoverage,operationId,fallbackReason,normalization,...(recoverable&&route==='GPT'?{recoveredFromPlanId:baseId}:{}),evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:EDITORIAL_PLAN_POLICY,createdAt:now,...body};await tx.write('editorial_plans',id,value);
  for(const story of body.stories){const c=shortlist.candidates.find(c=>c.targetVersionId===story.targetVersionId)!;
   if(story.decision==='DEFER'||story.decision==='SELECT')await deferEditorialWork(tx,c,story.decision==='SELECT'?'AWAITING_SUPPORTED_PUBLICATION':capacityAdjustments.find(a=>a.targetVersionId===story.targetVersionId)?.reason??(!selectableForPlanning(c)?BLOCKED_DEFERRAL_REASON:'DEFERRED_EDITORIAL_WORK'),now,id,shortlist.window.end);
   else if(route==='GPT'||story.deltaType==='REPEAT'){
    if(route==='GPT'&&story.deltaType!=='REPEAT')await deferEditorialWork(tx,c,'OMITTED_BY_EDITOR',now,id,shortlist.window.end);
    const pending=await tx.list<EditorialWork>('editorial_deferred_work');for(const work of pending.filter(w=>w.stableTargetId===c.stableTargetId))await resolveEditorialWork(tx,work,story.deltaType==='REPEAT'?'ALREADY_COMMUNICATED':'OMITTED_BY_EDITOR',now,id);
   }
  }
  return value;
 });
}
