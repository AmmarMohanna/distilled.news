import {ASYNC_MODEL_CALL_MS} from './operation-timing';
import {readerHistoryMatches} from './reader-history';
import {prepareGlobalEditorialContext} from './editorial-global-context';
﻿import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore,feedTransact} from './store';
import {communicationFingerprint} from './editorial';
import {ADAPTIVE_BRIEFING_PROCESSING} from './scoring';
import {prepareEditorialPlan,editorialPlannerState,keyedEditorialPlanWireSchemaFor,fallbackEditorialPlan,validateEditorialPlan,type EditorialPlanRecord} from './editorial-plan';
import {compactEditorialInput,keyedEditorialState} from './editorial-transport';
import type {ShortlistRecord,ShortlistCandidate} from './shortlist';
import type {StrongSemanticModel} from './semantic-model';
import {deferEditorialWork} from './editorial-work';
/** Cohorts are model-context execution units, never editorial quotas. Complete
 * snapshots and paid child identities are frozen before execution. Every candidate
 * remains owned by the parent and absent judgments remain explicitly unresolved. */
export async function prepareAdaptiveEditorialPlan(store:V1FeedStore,shortlist:ShortlistRecord,now:string,strong?:StrongSemanticModel,options:{deadlineMs?:number}={}):Promise<EditorialPlanRecord>{
 if(!strong?.admission)return prepareEditorialPlan(store,shortlist,ADAPTIVE_BRIEFING_PROCESSING,now,strong);
 const feed=await store.getFeed(shortlist.feedId);
 const deadlineMs=options.deadlineMs??Date.now()+ADAPTIVE_BRIEFING_PROCESSING.maxWallClockMs;
 const frame=(scope:ShortlistRecord,context?:unknown)=>{const parent={...editorialPlannerState(scope,ADAPTIVE_BRIEFING_PROCESSING,feed,'CURRENT'),...(context?{comparativeContext:context}:{})},transport=compactEditorialInput(parent),state=keyedEditorialState(transport.state),schema=keyedEditorialPlanWireSchemaFor(transport.state,transport.contextFactCapabilities);return {state,schema,admission:strong.admission!(state,schema,'COMPARATIVE_EDITORIAL_PLAN')}};
 if(frame(shortlist).admission.fits&&Date.now()+ASYNC_MODEL_CALL_MS<=deadlineMs)return prepareEditorialPlan(store,shortlist,ADAPTIVE_BRIEFING_PROCESSING,now,strong);
 const id=await sha256(canonicalJson({shortlistId:shortlist.id,model:strong.model,policy:'global-editorial-continuation-v2'}));
 const existing=await store.read<EditorialPlanRecord>(shortlist.feedId,'editorial_plans',id);if(existing)return existing;
 const scopeFor=(candidates:ShortlistCandidate[]):ShortlistRecord=>({...shortlist,candidates,overflow:[],obligations:shortlist.obligations.filter(o=>candidates.some(c=>c.correctionObligationIds.includes(o.id))),ledger:shortlist.ledger.filter(e=>candidates.some(c=>readerHistoryMatches(c,e)||shortlist.obligations.some(o=>c.correctionObligationIds.includes(o.id)&&o.ledgerEntryId===e.id))),evidenceRevisionIds:[...new Set(candidates.flatMap(c=>c.evidenceRevisionIds))]});
 const work=await feedTransact(store,shortlist.feedId,async tx=>{
  const prior=await tx.read<{id:string;cohorts:ShortlistRecord[];unrepresentable:string[]}>('editorial_processing_work',id);if(prior)return prior;
  const cohorts:ShortlistRecord[]=[],unrepresentable:string[]=[];let pending:ShortlistCandidate[]=[];
  for(const candidate of shortlist.candidates){
   if(!frame(scopeFor([candidate])).admission.fits){unrepresentable.push(candidate.targetVersionId);continue}
   if(pending.length&&!frame(scopeFor([...pending,candidate])).admission.fits){const scope=scopeFor(pending);scope.id=JSON.stringify([id,cohorts.length]);cohorts.push(scope);pending=[]}pending.push(candidate);
  }
  if(pending.length){const scope=scopeFor(pending);scope.id=JSON.stringify([id,cohorts.length]);cohorts.push(scope)}
  const value={id,feedId:shortlist.feedId,shortlistId:shortlist.id,cohorts,unrepresentable,createdAt:now};await tx.write('editorial_processing_work',id,value);for(const scope of cohorts)await tx.write('shortlists',scope.id,scope);return value;
 });
 const global=await prepareGlobalEditorialContext(store,shortlist,strong,work.cohorts,now,deadlineMs);
 const plans:EditorialPlanRecord[]=[],offered=new Set<string>(),accepted=new Set<string>(),operationIds:string[]=[...global.operationIds];
 const context=global.root?{rootId:global.root.id,globalSynopsis:global.root.synopsis,coverageCount:global.root.targetVersionIds.length,unresolvedTargetIds:[...work.unrepresentable,...(global.pending??[]).flatMap(p=>p.targetVersionIds)],instruction:'Compare original facts against shared Feed-wide significance and reader-value context. Relevance, urgency and novelty are different dimensions. No quota per cohort. Synopsis judgments are not writer facts.'}:undefined;
 const finalScopes:ShortlistRecord[]=[];
 if(context){let pending:ShortlistCandidate[]=[];for(const candidate of work.cohorts.flatMap(s=>s.candidates).filter(c=>global.root!.targetVersionIds.includes(c.targetVersionId))){
  if(!frame(scopeFor([candidate]),context).admission.fits)continue;
  if(pending.length&&!frame(scopeFor([...pending,candidate]),context).admission.fits){const scope=scopeFor(pending);scope.id=JSON.stringify([id,'GLOBAL_FINAL',global.root!.id,finalScopes.length]);finalScopes.push(scope);pending=[]}pending.push(candidate);
 }if(pending.length){const scope=scopeFor(pending);scope.id=JSON.stringify([id,'GLOBAL_FINAL',global.root!.id,finalScopes.length]);finalScopes.push(scope)}
 await feedTransact(store,shortlist.feedId,async tx=>{for(const scope of finalScopes)if(!await tx.read('shortlists',scope.id))await tx.write('shortlists',scope.id,scope)});}
 for(const scope of finalScopes){
  if(Date.now()+ASYNC_MODEL_CALL_MS>deadlineMs)break;
  const plan=await prepareEditorialPlan(store,scope,ADAPTIVE_BRIEFING_PROCESSING,now,strong,{processingScope:'editorial-global:'+scope.id,comparativeContext:context});plans.push(plan);operationIds.push(...plan.modelOperationIds??[]);
  const operations=await Promise.all((plan.modelOperationIds??[]).map(op=>store.read<any>(shortlist.feedId,'semantic_results',op)));
  const offeredIds=plan.inputCoverage?.offeredTargetVersionIds??scope.candidates.map(c=>c.targetVersionId);
  if(operations.some(op=>op?.usage.calls>0))offeredIds.forEach(id=>offered.add(id));
  if(plan.route==='GPT')offeredIds.forEach(id=>accepted.add(id));
 }
 // Retain model decisions exactly; no missing decision is fabricated as SUPPRESS
 // or REPEAT. Technical waiting is explicit and does not retire the facts.
 let order=0;
 const stories=fallbackEditorialPlan(shortlist).stories.map(unresolved=>{
  const judged=plans.filter(p=>p.route==='GPT').flatMap(p=>p.stories).find(s=>s.targetVersionId===unresolved.targetVersionId);
  return judged?{...judged,order:order++}:{...unresolved,decision:'DEFER' as const,treatment:'OMIT' as const,order:order++,rationale:'EDITORIAL_PROCESSING_PENDING: no accepted comparative decision; retained for continuation.',relevanceRationale:'Resource or context wait is not evidence of irrelevance.'};
 }).sort((a,b)=>(b.editorialImportance??0)-(a.editorialImportance??0));
 stories.forEach((s,index)=>s.order=index);
 const obligations=shortlist.obligations.map(o=>plans.filter(p=>p.route==='GPT').flatMap(p=>p.obligations).find(d=>d.obligationId===o.id)??{obligationId:o.id,handling:'DEFER' as const,targetVersionId:null,reason:'Awaiting accepted evidence-grounded comparative judgment.'});
 const body=validateEditorialPlan({stories,obligations},shortlist);
 return feedTransact(store,shortlist.feedId,async tx=>{
  if(tx.snapshot.feed.revision!==shortlist.feedRevision||await communicationFingerprint(tx,shortlist.window.end)!==shortlist.communicationFingerprint)throw Error('EDITORIAL_SNAPSHOT_CHANGED');
  const prior=await tx.read<EditorialPlanRecord>('editorial_plans',id);if(prior)return prior;
  const value:EditorialPlanRecord={...body,id,feedId:shortlist.feedId,feedRevision:shortlist.feedRevision,shortlistId:shortlist.id,window:shortlist.window,communicationFingerprint:shortlist.communicationFingerprint,route:accepted.size?'GPT':'DETERMINISTIC_FALLBACK',plannerSource:accepted.size?'REAL_COMPARATIVE_MODEL':'DETERMINISTIC_FALLBACK',fallbackReason:accepted.size?undefined:global.reason??'EDITORIAL_PROCESSING_PENDING',modelOperationIds:operationIds,evidenceRevisionIds:shortlist.evidenceRevisionIds,policyVersion:'global-editorial-continuation-v2',createdAt:now,inputCoverage:{policyVersion:'model-sized-editorial-cohorts-v1',inputBytes:frame(shortlist).admission.requestBytes,offeredTargetVersionIds:[...offered],notComparativelyReviewedTargetVersionIds:shortlist.candidates.filter(c=>!accepted.has(c.targetVersionId)).map(c=>c.targetVersionId),globalContextOperationIds:global.operationIds}};
  if(accepted.size)await tx.write('editorial_plans',id,value);
  else {const progressId=JSON.stringify([id,value.fallbackReason,operationIds]);if(!await tx.read('editorial_processing_progress',progressId))await tx.write('editorial_processing_progress',progressId,{...value,id:progressId,workId:id,state:'WAITING'})}
  for(const c of shortlist.candidates)if(!accepted.has(c.targetVersionId))await deferEditorialWork(tx,c,'PLANNER_INPUT_OVERFLOW',now,id,shortlist.window.end,{adaptive:true});
  return value;
 });
}
