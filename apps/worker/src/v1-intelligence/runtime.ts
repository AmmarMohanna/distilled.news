import {productV3Enabled,productV3Ready,productV3Models,prepareV3Window,publishProductV3Window,SettledV3CallFailure} from './v3-window';
import {retainBacklogReview,backlogRevisionIds} from './review-admission';
import {prepareV2Shortlist} from './shortlist-v2';
import {editorialContract} from './editorial-requirements';
import {prepareV2EditorialPlan} from './editorial-plan-v2';
import {preparedV3Delivery,windowHasHoldingJobs,windowIntakeCoverage,type WindowIntakeCoverage} from './window-coverage';
import {observeWindowReadiness} from './window-readiness';
import {withFeedWriteTurn,IntelligenceTurnBusy} from '../connector-intelligence-turn';
import {withLatency,measureLatency,countLatency} from './latency';
import {ModelSpendingWait,modelSpendingAccount} from './model-spending';
import {llmRoute} from './provider-routing';
import {runProviderAccountingRecovery} from './provider-recovery';
import {prepareAdaptiveEditorialPlan} from './editorial-continuation';
import {enqueueV1,pendingV1Jobs} from '../v1-queue-dispatch';
import {feedExistedInWindow} from '../connector-publication-window';
import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import type {Env,DistilledQueueMessage} from '../types';
import {v1SourceEnabled} from '../v1-downstream-runtime';
import {V1IntakeStore} from '../v1-intake/store';
import {transact} from '../v1-intake/transaction';
import type {DownstreamJob,IntakeScope} from '../v1-intake/types';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore,feedTransact} from './store';
import {processEvidenceIntelligence} from './engine';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET,ADAPTIVE_BRIEFING_PROCESSING,type PublicationWindow} from './scoring';
import {publishSelection,QuietPublication} from './publication';
import {createStoredEvidenceModel} from './model';
import {createSemanticSalienceScorer} from './salience-runtime';
import type {EventSalienceScorer} from './salience';
import {SalienceContentionError} from './salience-persistence';
import {SynthesisCompatibilityError} from './language';
import {projectEditionLedger,refreshSourceCorrectionObligations} from './ledger';
import {prepareSemanticMatch} from './semantic-preparation';
import {scheduleExtractionUpgrades,hasUnscheduledExtractionUpgrade} from './extraction-upgrade';
import {recordBlockedWindow} from './blocked-window';
import {nextRematch,rematchExhausted,REMATCH_CONTINUATION_POLICY,STALE_REASON,semanticResourceRetryAt,isBudgetDenial,protectedRematchRevisionIds,prioritizeRematches,type RematchRequest,type RematchAttempt} from './rematch';
import {semanticBacklogMetrics} from './semantic-observability';
import {withSemanticWorkLease,SemanticLeaseError} from './semantic-work-lease';
import {SemanticContentionError} from './semantic-operations';
import {prepareSemanticShortlist,shortlistInTransaction} from './shortlist';
import {orderedPendingWindows,editorialWindowAwaitingRecovery} from './window-delivery';
import {materializeV3Catchup,supersedeUnstartedV3Windows,V3_CATCHUP_LIMIT} from './window-catchup';
import {prepareEditorialPlan} from './editorial-plan';
import {createStrongSemanticModel} from './semantic-model';
import type {FeedRecord} from './types';
import {synchronizeV1ProductSource} from './product';
import {publicationWindowSchema,livePublicationWindow,preparingLiveWindow,nextLiveBriefingAt,DELIVERY_LEAD_MS} from './schedule';

export type V1BriefingMessage={type:'v1_briefing';feedId:string;window:PublicationWindow};
export {windowHasHoldingJobs} from './window-coverage';
const messageSchema=z.object({type:z.literal('v1_briefing'),feedId:z.string().min(1),window:publicationWindowSchema}).strict();
const intakeWaitReason='AWAITING_INTAKE_REASSESSMENT';
const incompleteIntakeReason='INCOMPLETE_INTAKE_COVERAGE';
function isIntakeStatus(reason:string|undefined):boolean {
 return !reason||reason===intakeWaitReason||reason===incompleteIntakeReason;
}
export interface BriefingRequest {catchup?:{policy:'v3-unstarted-backlog-v1';supersededBy:string;at:string};engine?:'v2'|'v3';v3InputId?:string;coverage?:WindowIntakeCoverage;semanticCoverage?:{unresolvedTargets:unknown[]};id:string;feedId:string;window:PublicationWindow;state:'PENDING'|'DONE'|'FAILED';attempts:number;nextAttemptAt?:string;failure?:string;createdAt:string;requireModel?:boolean;result?:'QUIET'|'PUBLISHED'|'DEFERRED';reason?:string;completedAt?:string;blocked?:import('./blocked-window').BlockedWindow}
export const windowIdentity=(feedId:string,window:PublicationWindow)=>sha256(canonicalJson({feedId,start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()}));
async function approvedFeed(env:Env,feedId:string):Promise<void> {
 if(env.V1_DOWNSTREAM_ENABLED!=='true') throw new HandoffError('SCOPE_DENIED');
 const rows=await env.DB.prepare("SELECT id FROM v1_intake_scopes WHERE feed_id=? AND json_extract(json,'$.enabled')=1 AND json_extract(json,'$.deletedAt') IS NULL").bind(feedId).all<{id:string}>();
 if(!rows.results.some(s=>v1SourceEnabled(env,s.id))) throw new HandoffError('SCOPE_DENIED');
 // A partial Feed switch would synthesize non-canary evidence as well. Require
 // every active approved source in the Feed to be explicitly switched together.
 if(rows.results.some(s=>!v1SourceEnabled(env,s.id))) throw new HandoffError('SCOPE_DENIED');
 const product=await env.DB.prepare('SELECT 1 AS present FROM v1_product_bindings WHERE feed_id=? LIMIT 1').bind(feedId).first();
 if(product) {
  const approved=await env.DB.prepare('SELECT id FROM sources WHERE briefing_id=? AND enabled=1').bind(feedId).all<{id:string}>();
  if(approved.results.some(s=>!v1SourceEnabled(env,s.id) || !rows.results.some(r=>r.id===s.id))) throw new HandoffError('SCOPE_DENIED');
 }
}
export function publicationWindow(kind:FeedRecord['briefingFrequency'],now:Date):PublicationWindow {
 let end:number,duration:number;
 if(kind==='WEEKLY') {const midnight=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());end=midnight-((now.getUTCDay()+6)%7)*86400000;duration=7*86400000}
 else {duration=kind==='30M'?1800000:kind==='HOURLY'?3600000:86400000;end=Math.floor(now.getTime()/duration)*duration}
 return {start:new Date(end-duration).toISOString(),end:new Date(end).toISOString(),kind};
}
/** Ad-hoc evaluation windows are recoverable calls, not scheduled deliveries. */
export function isAutomaticReportingWindow(window:PublicationWindow):boolean {
 if(window.kind==='WEEKLY')return false;
 if(window.durationMinutes!==undefined)return publicationWindowSchema.safeParse(window).success;
 const expected=publicationWindow(window.kind,new Date(window.end));
 return Date.parse(expected.start)===Date.parse(window.start)&&Date.parse(expected.end)===Date.parse(window.end);
}
export async function processV1Reassessment(env:Env,id:string,now=new Date().toISOString()) {
 const intake=new V1IntakeStore(env.DB),row=await intake.read<DownstreamJob>('jobs',id);
 if(!row || row.value.kind!=='REASSESS' || row.value.state==='DONE' || row.value.exhausted || !v1SourceEnabled(env,row.feedSourceId)) return 'SKIPPED';
 if(row.value.nextAttemptAt&&Date.parse(row.value.nextAttemptAt)>Date.parse(now))return 'WAITING_RETRY';
 await synchronizeV1ProductSource(env.DB,row.feedSourceId,now);
 const scope=await intake.snapshot(row.feedSourceId);await approvedFeed(env,scope.scope.feedId);
 // Newly acquired V3 evidence needs no semantic preprocessor. Leave previously
 // started V2 operations and rematches on their original recovery path.
 if(productV3Enabled(env)){
  const started=await new V1FeedStore(env.DB).hasLegacySemanticIntentForObservation(scope.scope.feedId,row.value.observationId);
  if(!started)return withFeedWriteTurn(env,scope.scope.feedId,()=>feedTransact(new V1FeedStore(env.DB),scope.scope.feedId,async tx=>{const job=await intake.read<DownstreamJob>('jobs',id);if(!job||job.feedSourceId!==row.feedSourceId)throw new HandoffError('SCOPE_DENIED');tx.completeJob(job.value);return 'DONE';}),`review:${id}`);
 }
 if(editorialContract(env.V1_PUBLICATION_VALIDATION_CONTRACT)==='EVIDENCE_GROUNDED_V2'&&await withFeedWriteTurn(env,scope.scope.feedId,()=>retainBacklogReview(new V1FeedStore(env.DB),id,now),`admission:${id}`))return 'BACKLOG_RETAINED';
 return withLatency({feedId:scope.scope.feedId,reviewId:id,phase:'REVIEW'},async()=>{
 try {return await withSemanticWorkLease(env.DB,scope.scope.feedId,async store=>{
  const prepared=await measureLatency('SEMANTIC_PREPARATION',()=>prepareSemanticMatch(store,env,id,now));
  await withFeedWriteTurn(env,scope.scope.feedId,()=>measureLatency('CANONICAL_REVIEW',()=>processEvidenceIntelligence(store,id,now,prepared?.matchers)),`review:${id}`);
  return 'DONE';
 },env.V1_REVIEW_PREPARATION_ISOLATED==='true'?`review:${id}`:undefined)}
 catch(error) {
  if(error instanceof SemanticContentionError||error instanceof SemanticLeaseError||error instanceof IntelligenceTurnBusy)throw error;
  // Provider preparation is outside CAS; only canonical consumption retries.
  // Failure state and retry scheduling are durable, bounded and source-scoped.
  await transact(intake,row.feedSourceId,async tx=>{
   const job=await tx.read<DownstreamJob>('jobs',id);if(!job || job.state==='DONE' || job.exhausted) return;
   const attempts=job.attempts+1,terminal=attempts>=5 || error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE';
   tx.write('jobs',id,{...job,attempts,state:terminal?'FAILED':'PENDING',exhausted:terminal,failureCode:error instanceof HandoffError?error.code:'INTELLIGENCE_FAILED',nextAttemptAt:new Date(Date.parse(now)+30000*2**(attempts-1)).toISOString()});
  });
  if(error instanceof HandoffError) throw error;throw new HandoffError('TEMPORARY_UNAVAILABLE');
 }
 });
}
async function resolvedRematchDependencies(db:D1Database,attempts:RematchAttempt[]):Promise<ReadonlySet<string>>{
 const reasons=new Set<string>();if(attempts.some(a=>a.reason==='PROVIDER_LIMIT_MIGRATION_REQUIRED')&&await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_model_provider_guards'").first())reasons.add('PROVIDER_LIMIT_MIGRATION_REQUIRED');return reasons;
}
export async function processV1Rematch(env:Env,feedId:string,requestId:string,now=new Date().toISOString()):Promise<void> {
 return withLatency({feedId,reviewId:requestId,phase:'REMATCH'},async()=>{
 await approvedFeed(env,feedId);return withSemanticWorkLease(env.DB,feedId,async store=>{const request=await store.read<RematchRequest>(feedId,'rematch_requests',requestId);if(!request)return;
 if(editorialContract(env.V1_PUBLICATION_VALIDATION_CONTRACT)==='EVIDENCE_GROUNDED_V2'&&await withFeedWriteTurn(env,feedId,()=>retainBacklogReview(store,request.jobId,now),`admission:${requestId}`))return;
 const allAttempts=await store.list<RematchAttempt>(feedId,'rematch_attempts'),attempt=nextRematch(request,allAttempts,now,{costAdmission:true,resolvedWaitReasons:await resolvedRematchDependencies(env.DB,allAttempts)}),history=allAttempts.filter(a=>a.requestId===requestId);if(!attempt)return;
 const prepared=await measureLatency('SEMANTIC_PREPARATION',()=>prepareSemanticMatch(store,env,request.jobId,now,{attempt}));
 return withFeedWriteTurn(env,feedId,async()=>{
 const active=(await store.currentEvidence(feedId)).some(e=>e.revision.id===request.evidenceRevisionId);
 const eligible=active&&prepared&&prepared.prepared.decision.structuralRelation!=='DEFER';
 // Staleness is only observable at consumption (the engine sees the Events current at commit); record it so it is accounted as a race, not a semantic failure.
 let stale=false;const observed=eligible?{...prepared.matchers,event:{match:(input:Parameters<typeof prepared.matchers.event.match>[0])=>{const decision=prepared.matchers.event.match(input);if(decision.provenance.fallbackReason===STALE_REASON)stale=true;return decision}}}:undefined;
 const consumed=eligible?await measureLatency('CANONICAL_REVIEW',()=>processEvidenceIntelligence(store,request.jobId,now,observed!,JSON.stringify([request.id,attempt]))):undefined;
 const succeeded=Boolean(consumed&&consumed.decision==='PROCESSED'&&!consumed.semanticDeferred);
 const reason=!active?'STALE_EVIDENCE':succeeded?undefined:stale?STALE_REASON:prepared?.prepared.decision.provenance.fallbackReason??(prepared?.prepared.decision.structuralRelation==='DEFER'?'SEMANTIC_IDENTITY_UNRESOLVED':consumed?.semanticDeferred?'SEMANTIC_CONSTRUCTION_UNRESOLVED':'SEMANTIC_PREPARATION_UNAVAILABLE'),budgetWait=active&&isBudgetDenial({state:'DEFERRED',reason});
 const id=JSON.stringify([request.id,attempt,now,'semantic-cost-admission-v1']);
 await feedTransact(store,feedId,async tx=>{if(!await tx.read('rematch_attempts',id))await tx.write('rematch_attempts',id,{id,feedId,requestId,attempt,...(budgetWait?{resourcePolicy:'semantic-cost-admission-v1' as const}:{}),state:succeeded?'SUCCEEDED':budgetWait?'WAITING_BUDGET':!active||request.policyVersion!==REMATCH_CONTINUATION_POLICY&&rematchExhausted([...history,{reason,attempt,state:'DEFERRED'}])?'EXHAUSTED':'DEFERRED',nextAttemptAt:succeeded?undefined:budgetWait?semanticResourceRetryAt(request.id,now,history.filter(a=>a.state==='WAITING_BUDGET').length):new Date(Date.parse(now)+(reason===STALE_REASON?60000*2**history.filter(a=>a.reason===STALE_REASON).length:Math.min(3600000,300000*2**Math.min(attempt-1,4)))).toISOString(),createdAt:now,reason} satisfies RematchAttempt)});
 },`rematch:${requestId}`);
 },env.V1_REVIEW_PREPARATION_ISOLATED==='true'?`rematch:${requestId}`:undefined);
 });
}
export async function processV1Briefing(env:Env,raw:V1BriefingMessage,now=()=>new Date().toISOString(),salienceScorer?:EventSalienceScorer,fetcher:typeof fetch=fetch,publicationOptions?:{requireModel?:boolean;maxSelectedDevelopments?:number;scheduledDelivery?:boolean}) {
 const parsed=messageSchema.safeParse(raw);if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
 const {feedId,window}=parsed.data;
 if(Date.parse(window.end)>Date.parse(now()) || Date.parse(window.start)>=Date.parse(window.end) || Date.parse(window.end)-Date.parse(window.start)>7*86400000) throw new HandoffError('INVALID_REQUEST');
 if(publicationOptions?.scheduledDelivery&&!isAutomaticReportingWindow(window))return undefined;
 await approvedFeed(env,feedId);const store=new V1FeedStore(env.DB),id=await windowIdentity(feedId,window);
 return withLatency({feedId,windowId:id,phase:'PUBLICATION'},async()=>{
 countLatency('windowClosedAgeMs',Math.max(0,Date.parse(now())-Date.parse(window.end)));
 const required=await feedTransact(store,feedId,async tx=>{
  const prior=await tx.read<BriefingRequest>('briefing_requests',id);
  if((publicationOptions?.requireModel||env.V1_REAL_MODEL_REQUIRED==='true')&&!prior?.requireModel){const value:BriefingRequest={...(prior??{id,feedId,window,state:'PENDING' as const,attempts:0,createdAt:now()}),requireModel:true};await tx.write('briefing_requests',id,value);return true;}
  return prior?.requireModel??false;
 });
 const existing=await store.read<import('./publication').BriefingEditionRecord>(feedId,'editions',id);
 if(existing) {
  if(required&&existing.generation.provider==='NONE')throw new HandoffError('INVALID_REQUEST');
  await projectEditionLedger(store,feedId,existing.id);
  // Publication is atomic, but the request acknowledgement is a later commit.
  // Recover a crash in that gap without reopening synthesis or paid calls.
  await feedTransact(store,feedId,async tx=>{
   const request=await tx.read<BriefingRequest>('briefing_requests',id);
   if(request && request.state!=='DONE') await tx.write('briefing_requests',id,{...request,state:'DONE'});
  });return existing;
 }
 const request=await feedTransact(store,feedId,async tx=>{
  const prior=await tx.read<BriefingRequest>('briefing_requests',id);if(prior?.engine)return prior;
  const hasV2=Boolean(await tx.store.db.prepare("SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=? LIMIT 1").bind(feedId,`editorial:${window.start}:${window.end}`).first())||Boolean(await tx.read('synthesis_jobs',id))||Boolean(await tx.store.db.prepare("SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='editorial_plans' AND json_extract(json,'$.window.start')=? AND json_extract(json,'$.window.end')=? LIMIT 1").bind(feedId,window.start,window.end).first());
  const value:BriefingRequest={...(prior??{id,feedId,window,state:'PENDING' as const,attempts:0,createdAt:now()}),engine:productV3Enabled(env)&&!hasV2?'v3':'v2'};await tx.write('briefing_requests',id,value);return value;
 });
 if(request.state==='FAILED') throw new HandoffError('INVALID_REQUEST');
 if(request.state==='DONE') return undefined;
 if(request.reason==='AWAITING_SCHEDULED_DELIVERY'&&request.nextAttemptAt&&Date.parse(request.nextAttemptAt)>Date.parse(now()))return undefined;
 // Queue delivery order is not guaranteed. Recheck the same durable pending
 // requests at consumption, before admitting any editorial or writer operation.
 for(const older of orderedPendingWindows(await store.pendingBriefingRequests(feedId),now()).filter(r=>isAutomaticReportingWindow(r.window)&&Date.parse(r.window.end)<Date.parse(window.end))){
  if((await windowHasHoldingJobs(env.DB,feedId,older.window.end,{v3:older.engine==='v3',now:now()})&&!await preparedV3Delivery(env.DB,feedId,older.id,Date.parse(now())))||await editorialWindowAwaitingRecovery(env.DB,feedId,older.window,older.reason))continue;
  const job=await store.read<{state:string;pendingCall?:string;leaseUntil:string}>(feedId,'synthesis_jobs',older.id);
  if(job?.state==='FAILED')continue;
  if(job?.state==='RUNNING'&&Date.parse(job.leaseUntil)>Date.parse(now()))return undefined;
  if(job?.pendingCall){const result=await store.read<{status:string;usage?:{reported:boolean}}>(feedId,'semantic_results',job.pendingCall)??await store.read<{status:string;usage?:{reported:boolean}}>(feedId,'semantic_settlements',job.pendingCall);if(result?.status!=='SUCCEEDED'||!result.usage?.reported)continue;}
  countLatency('olderWindowPending');return undefined;
 }
 const readinessAt=now();
 const holding=await measureLatency('WINDOW_READINESS',async()=>{
  const settings={v3:request.engine==='v3',now:readinessAt};
  if(!await windowHasHoldingJobs(env.DB,feedId,window.end,settings))return false;
  const deferAcquisition=settings.v3&&await preparedV3Delivery(env.DB,feedId,id,Date.parse(readinessAt));
  if(deferAcquisition&&!await windowHasHoldingJobs(env.DB,feedId,window.end,{...settings,deferAcquisition}))return false;
  return feedTransact(store,feedId,async tx=>{
   const current=await tx.read<BriefingRequest>('briefing_requests',id);
   if(current?.state!=='PENDING'||!isIntakeStatus(current.reason))return true;
   if(current.reason===intakeWaitReason&&current.coverage?.state==='PENDING')return true;
   const coverage=await windowIntakeCoverage(env.DB,feedId,window.end,{...settings,deferAcquisition});
   if(!coverage.pendingJobs)return false;
   await tx.write('briefing_requests',id,{...current,coverage,reason:intakeWaitReason,nextAttemptAt:new Date(Date.parse(readinessAt)+60000).toISOString()});
   countLatency('pendingJobs',coverage.pendingJobs);countLatency('failedJobs',coverage.failedJobs);
   return true;
  });
 });
 if(holding){countLatency('publicationDeferred');return undefined;}

 if((required||request.engine==='v3')&&!(request.engine==='v3'?productV3Ready(env):createStoredEvidenceModel(env,fetcher))){
  await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current?.state==='PENDING'&&current.reason!=='MODEL_SETUP_REQUIRED')await tx.write('briefing_requests',id,{...current,reason:'MODEL_SETUP_REQUIRED'});});
  return undefined;
 }
 let failureStage='SHORTLIST';
 try {
  if(request.engine==='v3')return await publishProductV3Window(env,feedId,window,id,now,fetcher);
  if(window.scheduledFor&&Date.parse(now())<Date.parse(window.scheduledFor)){
   await feedTransact(store,feedId,tx=>tx.write('briefing_requests',id,{...request,reason:'AWAITING_SCHEDULED_DELIVERY',nextAttemptAt:window.scheduledFor}));return undefined;
  }
  // A configured writer model only ever sees the approved facts of an EditorialPlan, so model-backed synthesis implies the plan path;
  // the deterministic fallback plan is used when no strong planning model is available. The writer never fixes upstream selection.
  const writer=createStoredEvidenceModel(env,fetcher);
  // Resume existing paid legacy scopes under their frozen contracts; new windows
  // use adaptive execution. Never migrate a terminal request or a paid identity.
  const activeFeedRevision=(await store.getFeed(feedId))?.revision;
  const retainedJob=await store.read<{state:string;selectionId:string}>(feedId,'synthesis_jobs',id);
  const retainedSelection=retainedJob&&['PENDING','RUNNING'].includes(retainedJob.state)?await store.read<import('./scoring').SelectionRecord>(feedId,'selections',retainedJob.selectionId):undefined;
  // A publication continuation owns its committed selection. Rebuilding its
  // completed editor stages can retire/reorder work and contend with intake.
  // publishSelection still revalidates the live roots, source scope and ledger.
  const frozenSelection=retainedSelection?.budget.mode==='ADAPTIVE'&&retainedSelection.feedRevision===activeFeedRevision&&retainedSelection.selectedCandidateIds.length&&Date.parse(retainedSelection.window.start)===Date.parse(window.start)&&Date.parse(retainedSelection.window.end)===Date.parse(window.end)?retainedSelection:undefined;
  const historicalPlans=frozenSelection?[]:(await store.list<import('./editorial-plan').EditorialPlanRecord>(feedId,'editorial_plans')).filter(p=>p.window.start===window.start&&p.window.end===window.end&&p.feedRevision===activeFeedRevision);
  const legacyPlan=historicalPlans.find(p=>p.policyVersion=== 'comparative-editorial-plan-v21');
  const budget=legacyPlan?DEFAULT_BRIEFING_BUDGET:ADAPTIVE_BRIEFING_PROCESSING;
  const frozen=legacyPlan?await store.read<import('./shortlist').ShortlistRecord>(feedId,'shortlists',legacyPlan.shortlistId):undefined;
  const contract=editorialContract(env.V1_PUBLICATION_VALIDATION_CONTRACT);
  let shortlist=frozenSelection?undefined:frozen??(env.V1_EDITORIAL_PLAN_ENABLED==='true' || writer || env.V1_SEMANTIC_POLICY!=='DETERMINISTIC' && (env.OPENROUTER_API_KEY || env.V1_SEMANTIC_POLICY==='SEMANTIC')?await measureLatency('SEMANTIC_SHORTLIST',()=>prepareSemanticShortlist(store,feedId,window,now(),legacyPlan?20:undefined,env,fetcher)):undefined);
  if(shortlist&&contract==='EVIDENCE_GROUNDED_V2')shortlist=await prepareV2Shortlist(store,shortlist);
  if(shortlist)await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id),semanticCoverage=shortlist.unresolvedTargets?.length?{unresolvedTargets:shortlist.unresolvedTargets}:undefined;if(current&&canonicalJson(current.semanticCoverage)!==canonicalJson(semanticCoverage))await tx.write('briefing_requests',id,{...current,semanticCoverage})});
  if(contract==='EVIDENCE_GROUNDED_V2'&&shortlist&&!shortlist.candidates.length&&!shortlist.overflow.length&&!shortlist.obligations.length){
   await feedTransact(store,feedId,async tx=>{
    const current=await tx.read<BriefingRequest>('briefing_requests',id);if(!current||current.state!=='PENDING')return;
    // Rebuild inside the final CAS snapshot: an arrival between the initial
    // empty shortlist and this commit must not be acknowledged as quiet.
    await refreshSourceCorrectionObligations(tx,now());
    const latest=await shortlistInTransaction(tx,window,now(),undefined,{collectOnly:true,reportingWindows:true});
    if(latest.candidates.length||latest.overflow.length||latest.obligations.length)return;
    const coverage=await windowIntakeCoverage(env.DB,feedId,window.end),incomplete=coverage.state!=='COMPLETE'||Boolean(latest.unresolvedTargets?.length);
    await tx.write('briefing_requests',id,{...current,coverage,semanticCoverage:latest.unresolvedTargets?.length?{unresolvedTargets:latest.unresolvedTargets}:undefined,state:'DONE',result:incomplete?'DEFERRED':'QUIET',reason:incomplete?'INCOMPLETE_WINDOW_EVIDENCE':'NO_IN_WINDOW_DEVELOPMENTS',completedAt:now()});
   });return undefined;
  }
  failureStage='EDITORIAL_PLAN';
  const plan=shortlist?await measureLatency('EDITORIAL_PLAN',()=>contract==='EVIDENCE_GROUNDED_V2'?prepareV2EditorialPlan(store,shortlist,now(),createStrongSemanticModel(env,fetcher,'EDITORIAL'),{completeParentDecisions:true}):legacyPlan?prepareEditorialPlan(store,shortlist,budget,now(),createStrongSemanticModel(env,fetcher,'EDITORIAL')):prepareAdaptiveEditorialPlan(store,shortlist,now(),createStrongSemanticModel(env,fetcher,'EDITORIAL'))):undefined;
  if(plan&&plan.route!=='GPT'&&plan.modelOperationIds?.length){
   const operations=await store.readMany<import('./semantic-operations').SemanticOperationResult>(feedId,'semantic_results',plan.modelOperationIds);
   if([...operations.values()].some(operation=>operation.usage.calls>0&&!operation.usage.reported))throw new ModelSpendingWait('SEMANTIC_OUTCOME_UNKNOWN');
  }
  if(plan?.route!=='GPT'&&plan?.fallbackReason&&/ACCOUNT_|MODEL_CAPABILITY|MODEL_CONTEXT|RESOURCE|AUTHORIZATION|LEGACY_LIABILITIES|CONCURRENCY|COST_ESTIMATE|EXECUTION_YIELD|GLOBAL_RECONCILIATION_CAPACITY|^SEMANTIC_OUTCOME_UNKNOWN$/.test(plan.fallbackReason))throw new ModelSpendingWait(plan.fallbackReason);
  if(required&&shortlist?.candidates.length&&plan?.route!=='GPT')throw new HandoffError('TEMPORARY_UNAVAILABLE');
  failureStage='SELECTION';
  const selection=frozenSelection??await measureLatency('RANKING_SELECTION',()=>scoreAndSelect(store,feedId,window,budget,now(),salienceScorer??(plan?.route==='GPT'?undefined:createSemanticSalienceScorer(env)),plan));
  // Protected work that cannot be delivered yet is a durable, truthful BLOCKED state tied to reassessment progress, not a failure retried
  // identically until the attempt budget is spent. The obligation stays OPEN and nothing is reported as delivered.
  if(!selection.selectedCandidateIds.length&&plan?.validationContract==='EVIDENCE_GROUNDED_V2'&&plan.stories.some(s=>s.decision==='DEFER'||s.validation?.dispositions.some(d=>d.disposition==='DEFERRED'))){await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current)await tx.write('briefing_requests',id,{...current,state:'DONE',result:'DEFERRED',reason:'V2_EDITORIAL_PROPOSITIONS_PENDING',completedAt:now()});});return undefined;}
  if(!selection.selectedCandidateIds.length && selection.deferredProtectedTargetIds?.length && shortlist){await recordBlockedWindow(store,feedId,id,shortlist,selection,now());return undefined}
  if(publicationOptions?.maxSelectedDevelopments!==undefined&&(!Number.isInteger(publicationOptions.maxSelectedDevelopments)||publicationOptions.maxSelectedDevelopments<1||selection.selectedCandidateIds.length>publicationOptions.maxSelectedDevelopments))throw Error('SELECTED_DEVELOPMENT_LIMIT');
  failureStage='SYNTHESIS_PUBLICATION';
  const edition=selection.selectedCandidateIds.length?await measureLatency('SYNTHESIS_VERIFICATION_PUBLICATION',()=>publishSelection(store,feedId,selection.id,{now,model:writer,requireModel:required,validationContract:contract})):undefined;
  countLatency(edition?'publicationPublished':'publicationDeferred');
  if(edition)countLatency('windowCloseToPublicationMs',Math.max(0,Date.parse(edition.createdAt)-Date.parse(window.end)));
  if(edition)try{
   // One bounded metadata-only query per published edition, never article bodies.
   const lineage=await env.DB.prepare(`SELECT MIN(json_extract(i.json,'$.observation.observedAt')) AS firstObservedAt,MIN(json_extract(r.json,'$.acceptedAt')) AS firstAcceptedAt FROM v1_revisions r JOIN v1_intake_scopes s ON s.id=r.feed_source_id LEFT JOIN v1_inputs i ON i.id=json_extract(r.json,'$.sourceObservationId') AND i.feed_source_id=r.feed_source_id WHERE s.feed_id=? AND r.id IN (SELECT value FROM json_each(?))`).bind(feedId,JSON.stringify(edition.evidenceRevisionIds)).first<{firstObservedAt:string|null;firstAcceptedAt:string|null}>();
   if(lineage?.firstObservedAt)countLatency('firstObservedToPublicationMs',Math.max(0,Date.parse(edition.createdAt)-Date.parse(lineage.firstObservedAt)));
   if(lineage?.firstAcceptedAt)countLatency('firstAcceptedToPublicationMs',Math.max(0,Date.parse(edition.createdAt)-Date.parse(lineage.firstAcceptedAt)));
  }catch{countLatency('lineageDiagnosticUnavailable')}
  failureStage='LEDGER_PROJECTION';
  if(edition)await projectEditionLedger(store,feedId,edition.id);
  const deferred=!edition&&(plan?.stories.some(story=>story.decision==='DEFER')||Boolean(shortlist?.overflow.length));
  await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id),coverage=await windowIntakeCoverage(env.DB,feedId,window.end);if(!current)return;
   const semanticCoverage=frozenSelection?current.semanticCoverage:shortlist?.unresolvedTargets?.length?{unresolvedTargets:shortlist.unresolvedTargets}:undefined,incomplete=!edition&&(coverage.state!=='COMPLETE'||Boolean(semanticCoverage));
   await tx.write('briefing_requests',id,{...current,coverage,semanticCoverage,state:'DONE',result:edition?'PUBLISHED':incomplete?'DEFERRED':deferred?'DEFERRED':'QUIET',reason:incomplete?(coverage.state!=='COMPLETE'?'INCOMPLETE_INTAKE_COVERAGE':'INCOMPLETE_SEMANTIC_OWNERSHIP'):edition?undefined:deferred?'EDITORIAL_WORK_DEFERRED':'NO_SELECTED_DEVELOPMENTS',completedAt:now()});});return edition;
 } catch(error) {
  // Commit admission contention is not a failed draft/provider attempt. Keep
  // the frozen work and let transport rotate without consuming its retries.
  if(error instanceof IntelligenceTurnBusy||error instanceof SemanticLeaseError||error instanceof SemanticContentionError)throw error;
  if(error instanceof QuietPublication){await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id),coverage=await windowIntakeCoverage(env.DB,feedId,window.end);if(current)await tx.write('briefing_requests',id,{...current,coverage,...(coverage.state!=='COMPLETE'||current.semanticCoverage?.unresolvedTargets.length?{state:'DONE',result:'DEFERRED',reason:coverage.state!=='COMPLETE'?'INCOMPLETE_INTAKE_COVERAGE':'INCOMPLETE_SEMANTIC_OWNERSHIP',completedAt:now()}: {})})});return undefined;}
  if(error instanceof SettledV3CallFailure){
   // The frozen call can only replay the same failed result. Keep its receipt
   // and unresolved evidence; let subsequent windows proceed without resending it.
   await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current?.state==='PENDING')await tx.write('briefing_requests',id,{...current,state:'FAILED',failure:error.message,reason:error.message});});
   console.warn(JSON.stringify({type:'V3_SETTLED_CALL_FAILED',feedId,requestId:id,operationId:error.operationId}));
   return undefined;
  }
  const waitingJob=await store.read<{state:string;failure?:string}>(feedId,'synthesis_jobs',id);
  if(error instanceof ModelSpendingWait||waitingJob?.state==='PENDING'&&waitingJob.failure&&/ACCOUNT_|PROVIDER_RESOURCE|PROVIDER_LIMIT|AUTHORIZATION|EXECUTION_YIELD|MODEL_UNQUALIFIED|MODEL_BINDING|MODEL_CONTEXT|PAID_RESULT_AWAITING/.test(waitingJob.failure)){const reason=error instanceof ModelSpendingWait?error.reason:waitingJob!.failure!;await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current?.state==='PENDING'&&current.reason!==reason)await tx.write('briefing_requests',id,{...current,reason,nextAttemptAt:new Date(Date.parse(now())+60000).toISOString()})});return undefined;}
  console.error(JSON.stringify({type:'V1_BRIEFING_ATTEMPT_FAILED',feedId,requestId:id,stage:failureStage,error:error instanceof Error?error.message.slice(0,300):'UNKNOWN'}));
  // The publication lease owns contention; concurrent deliveries cannot consume
  // retry attempts while that lease is live or reopen a completed edition.
  await feedTransact(store,feedId,async tx=>{
   const current=await tx.read<BriefingRequest>('briefing_requests',id),job=await tx.read<{state:string;leaseUntil:string}>('synthesis_jobs',id);
   if(!current || current.state!=='PENDING' || error instanceof SalienceContentionError || job?.state==='RUNNING' && Date.parse(job.leaseUntil)>Date.parse(now())) return;
   const attempts=current.attempts+1,terminal=attempts>=5 || job?.state==='FAILED' || error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE';
   await tx.write('briefing_requests',id,{...current,state:terminal?'FAILED':'PENDING',attempts,nextAttemptAt:new Date(Date.parse(now())+60000*2**(attempts-1)).toISOString(),failure:error instanceof SynthesisCompatibilityError?error.reason:error instanceof HandoffError?error.code:'PUBLICATION_FAILED'});
  });throw error instanceof HandoffError?error:new HandoffError('TEMPORARY_UNAVAILABLE');
 }
 });
}
/** Auxiliary per-Feed maintenance (policy upgrades, rematch fan-out) must never prevent briefing dispatch:
 * a contended or failing maintenance step is reported and retried on the next tick, while the window requests
 * below keep being sent. Their durable state is untouched, so nothing is skipped or duplicated. */
async function maintenance(feedId:string,step:string,run:()=>Promise<void>):Promise<void> {
 try{await run()}catch(error){console.error(JSON.stringify({type:'V1_DISPATCH_MAINTENANCE_FAILED',feedId,step,error:error instanceof Error?error.message:'UNKNOWN'}))}
}
/** Relay uses durable pending jobs and edition/window identities on the existing queue. */
export async function dispatchV1Intelligence(env:Env,now=new Date(),options:{skipProviderAccountingRecovery?:boolean}={}):Promise<number> {
 if(env.V1_DOWNSTREAM_ENABLED!=='true') return 0;
 if(!options.skipProviderAccountingRecovery)await runProviderAccountingRecovery(env,now);
 const sourceIds=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 const productOnly=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'&&env.PRODUCT_FEEDS_ENABLED==='true';
 const feeds=new Set<string>();let sent=0;
 for(const id of sourceIds) {
  let scope:IntakeScope|undefined;
  try {scope=await synchronizeV1ProductSource(env.DB,id,now.toISOString(),productOnly)} catch(error) {if(error instanceof HandoffError && ['SCOPE_DENIED','IDEMPOTENCY_CONFLICT','INVALID_REQUEST'].includes(error.code)) continue;throw error}
  scope??=await new V1IntakeStore(env.DB).getScope(id);
  if(!scope?.enabled||scope.deletedAt)continue;
  feeds.add(scope.feedId);
  const rows=await pendingV1Jobs(env,id,'REASSESS',now);
  for(const job of rows) if(await enqueueV1(env,'v1_reassess',job.id,{type:'v1_reassess',jobId:job.id},now))sent++
 }
 const store=new V1FeedStore(env.DB);
 for(const id of feeds) {
  const feed=await store.getFeed(id);if(!feed || feed.paused || feed.deletedAt) continue;
  try {await approvedFeed(env,id)} catch(error) {if(error instanceof HandoffError && error.code==='SCOPE_DENIED') continue;throw error}
  if(!productV3Enabled(env))await maintenance(id,'EXTRACTION_UPGRADE',async()=>{
   if(feed.briefingSchedule||feed.briefingFrequency!=='WEEKLY'){const upgradeWindow=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now);if(await hasUnscheduledExtractionUpgrade(store,id,upgradeWindow))await feedTransact(store,id,tx=>scheduleExtractionUpgrades(tx,upgradeWindow,now.toISOString()))}
  });
  // V3 does not consume the V2 graph. Preserve explicit unfinished V2 windows,
  // but do not repeatedly replay retired graph history for V3-only feeds.
  const legacyWindow=productV3Enabled(env)?await env.DB.prepare("SELECT id FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED') AND json_extract(json,'$.engine')='v2' LIMIT 1").bind(id).first():true;
  if(legacyWindow)await maintenance(id,'REMATCH_DISPATCH',async()=>{
    const rematches=await store.list<RematchRequest>(id,'rematch_requests'),attempts=await store.list<RematchAttempt>(id,'rematch_attempts'),publishers=new Map((await store.currentEvidence(id)).map(e=>[e.revision.id,e.item.feedSourceId]));
    const protectedIds=await protectedRematchRevisionIds(store,id);
    if(now.getUTCMinutes()%15===0)console.info(JSON.stringify({type:'V1_SEMANTIC_BACKPRESSURE',feedId:id,...semanticBacklogMetrics(rematches,attempts,protectedIds,now.toISOString(),feed.briefingSchedule?.durationMinutes??(feed.briefingFrequency==='30M'?30:feed.briefingFrequency==='HOURLY'?60:1440))}));
    // Bound accepted sends, not candidates inspected. Reserved/declined transports
    // must not repeatedly hide otherwise eligible requests later in this order.
    const resolvedWaitReasons=await resolvedRematchDependencies(env.DB,attempts);
    const backlog=editorialContract(env.V1_PUBLICATION_VALIDATION_CONTRACT)==='EVIDENCE_GROUNDED_V2'?await feedTransact(store,id,tx=>backlogRevisionIds(store,tx)):new Set<string>();
    const eligible=prioritizeRematches(rematches.filter(r=>!backlog.has(r.evidenceRevisionId)&&nextRematch(r,attempts,now.toISOString(),{costAdmission:true,resolvedWaitReasons})),protectedIds,attempts,publishers);
    let accepted=0,considered=0;
    for(const request of eligible){if(accepted>=2)break;considered++;if(await enqueueV1(env,'v1_rematch',request.id,{type:'v1_rematch',feedId:id,requestId:request.id},now)){sent++;accepted++;}}
    if(eligible.length)console.info(JSON.stringify({type:'V1_REMATCH_DISPATCH',feedId:id,eligible:eligible.length,considered,enqueued:accepted}));
  });
  // Reassessment must finish first; the next bounded relay publishes its result.
  // Historical weekly windows remain callable/reproducible, but are not a new
  // live scheduling option. Existing UTC schedules remain unchanged otherwise.
  if(!feed.briefingSchedule && feed.briefingFrequency==='WEEKLY') continue;
  let window=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now);
  const latestWindow=window,catchup=env.V3_BACKLOG_CATCHUP_ENABLED==='true'&&productV3Enabled(env);
  if(feed.briefingSchedule?.clockStartAt){
   const schedule=feed.briefingSchedule,clockStartAt=schedule.clockStartAt!;
   const last=await env.DB.prepare(`SELECT json_extract(json,'$.window.end') AS end FROM v1_feed_documents
    WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.window.clockStartAt')=?
    AND json_extract(json,'$.window.durationMinutes')=? ORDER BY json_extract(json,'$.window.end') DESC LIMIT 1`)
    .bind(id,clockStartAt,schedule.durationMinutes).first<{end:string}>();
   const nextDelivery=last?nextLiveBriefingAt(schedule,new Date(Date.parse(last.end)+DELIVERY_LEAD_MS)):undefined;
   const next=livePublicationWindow(schedule,new Date(nextDelivery?Date.parse(nextDelivery)-DELIVERY_LEAD_MS:clockStartAt));
   if(Date.parse(next.end)<=Date.parse(window.end))window=next;
  }
  else if(feed.briefingSchedule?.originAt&&feed.briefingSchedule.durationMinutes<1440){
   // Materialize one consecutive close per tick, including after an outage or
   // a shorter interval edit. Retained requests keep their original windows.
   const schedule=feed.briefingSchedule;
   const last=await env.DB.prepare("SELECT json_extract(json,'$.window.end') AS end FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.window.originAt')=? AND json_extract(json,'$.window.durationMinutes')=? ORDER BY json_extract(json,'$.window.end') DESC LIMIT 1").bind(id,schedule.originAt!,schedule.durationMinutes).first<{end:string}>();
   const through=Math.max(Date.parse(schedule.originAt!),last?Date.parse(last.end):0);
   const next=through+schedule.durationMinutes*60000;
   if(next<=Date.parse(window.end))window=livePublicationWindow(schedule,new Date(next));
  }
  if(Date.parse(window.end)>now.getTime())continue;
  if(catchup&&Date.parse(window.end)<Date.parse(latestWindow.end)){
   let caughtUp=false;
   await maintenance(id,'V3_CATCHUP_MATERIALIZATION',async()=>{
   const windows:PublicationWindow[]=[];let cursor=window;
   while(windows.length<V3_CATCHUP_LIMIT&&Date.parse(cursor.end)<=Date.parse(latestWindow.end)){
    if(!isAutomaticReportingWindow(cursor)||Date.parse(cursor.start)<Date.parse(feed.createdAt))throw new HandoffError('INVALID_REQUEST');
    windows.push(cursor);if(Date.parse(cursor.end)===Date.parse(latestWindow.end))break;
    const delivery=feed.briefingSchedule?nextLiveBriefingAt(feed.briefingSchedule,new Date(cursor.scheduledFor??cursor.end)):undefined;
    const next=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,new Date(Date.parse(delivery!)-(feed.briefingSchedule.clockStartAt?DELIVERY_LEAD_MS:0))):publicationWindow(feed.briefingFrequency,new Date(Date.parse(cursor.end)+(Date.parse(cursor.end)-Date.parse(cursor.start))));
    if(Date.parse(next.start)!==Date.parse(cursor.end)||Date.parse(next.end)<=Date.parse(cursor.end))throw new HandoffError('INVALID_REQUEST');
    cursor=next;
   }
   await materializeV3Catchup(store,id,windows,now.toISOString(),w=>windowIdentity(id,w));
   console.info(JSON.stringify({type:'V3_CATCHUP_MATERIALIZATION',feedId:id,windows:windows.length,through:windows.at(-1)!.end,target:latestWindow.end}));
   caughtUp=Date.parse(windows.at(-1)!.end)===Date.parse(latestWindow.end);
   });
   if(!caughtUp)continue;
   window=latestWindow;
  }
  const editionId=await windowIdentity(id,window);
  // Preparation is a read-through mechanical shortlist, not an early edition
  // or a frozen paid editorial decision. Final arrivals are reloaded at close.
  const preparing=feed.briefingSchedule?preparingLiveWindow(feed.briefingSchedule,now):undefined;
  if(preparing&&Date.parse(feed.createdAt)<=Date.parse(preparing.start))await maintenance(id,'WINDOW_PREPARATION',async()=>{
   if(productV3Enabled(env)){const prepared=await prepareV3Window(store,id,preparing,now.toISOString(),productV3Models(env));console.info(JSON.stringify({type:'BRIEFING_WINDOW_PREPARATION',engine:'v3',feedId:id,window:preparing,evidenceRevisions:prepared.evidenceRevisionIds.length,preparedAt:now.toISOString()}));return;}
   const prepared=await feedTransact(store,id,async tx=>{
    const draft=await shortlistInTransaction(tx,preparing,now.toISOString(),undefined,{collectOnly:true,reportingWindows:env.V1_PUBLICATION_VALIDATION_CONTRACT==='EVIDENCE_GROUNDED_V2'});
    if(!await tx.read('shortlists',draft.id))await tx.write('shortlists',draft.id,draft);
    return draft;
   });
   console.info(JSON.stringify({type:'BRIEFING_WINDOW_PREPARATION',feedId:id,window:preparing,candidates:prepared.candidates.length,evidenceRevisions:prepared.evidenceRevisionIds.length,preparedAt:now.toISOString()}));
  });
  if(!feedExistedInWindow(feed.createdAt,window.end)||Date.parse(feed.createdAt)>Date.parse(window.start))continue;
  // Probe exact identities before taking any write transaction. All missing
  // records are still checked again under the existing feed CAS.
  const observationId=JSON.stringify([id,feed.revision,window.end]);
  const {results:boundary}=await env.DB.prepare(`
   SELECT kind,feed_id,json_extract(json,'$.state') AS request_state FROM v1_feed_documents WHERE kind='briefing_requests' AND id=?
   UNION ALL SELECT kind,feed_id,NULL FROM v1_feed_documents WHERE kind='editions' AND id=?
   UNION ALL SELECT kind,feed_id,NULL FROM v1_feed_documents WHERE kind='schedule_observations' AND id=?
  `).bind(editionId,editionId,observationId).all<{kind:string;feed_id:string;request_state:string|null}>();
  if(boundary.some(row=>row.feed_id!==id))throw new HandoffError('SCOPE_DENIED');
  const savedRequest=boundary.find(row=>row.kind==='briefing_requests');
  let pending=savedRequest?.request_state==='PENDING';
  // Record the observed boundary even while intake is busy.
  if(!boundary.some(row=>row.kind==='schedule_observations'))await maintenance(id,'SCHEDULE_OBSERVATION',async()=>{
   await feedTransact(store,id,async tx=>{
    if(await tx.read('schedule_observations',observationId))return;
    const prior=await env.DB.prepare(`SELECT json_extract(json,'$.window.end') AS end FROM v1_feed_documents
     WHERE feed_id=? AND kind='schedule_observations' AND json_extract(json,'$.feedRevision')=?
     AND julianday(json_extract(json,'$.window.end'))<julianday(?)
     ORDER BY julianday(json_extract(json,'$.window.end')) DESC,id LIMIT 1`).bind(id,feed.revision,window.end).first<{end:string}>();
    const priorEnd=Date.parse(prior?.end??''),expected:{id:string;window:PublicationWindow}[]=[];let cursor=window;
    for(let i=0;Date.parse(cursor.start)>priorEnd&&i<48;i++){
     cursor=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,new Date(Date.parse(cursor.start))):publicationWindow(feed.briefingFrequency,new Date(Date.parse(cursor.start)));
     expected.push({id:await windowIdentity(id,cursor),window:cursor});
    }
    await tx.preload('briefing_requests',expected.map(entry=>entry.id));
    const missing:PublicationWindow[]=[];
    for(const entry of expected)if(!await tx.read('briefing_requests',entry.id))missing.push(entry.window);
    await tx.write('schedule_observations',observationId,{id:observationId,feedId:id,feedRevision:feed.revision,window,requestId:editionId,createdAt:now.toISOString(),state:'BOUNDARY_OBSERVED',schedulePolicy:feed.briefingSchedule??{briefingFrequency:feed.briefingFrequency},missingExpectedBoundaries:missing,gapScanLimit:48,gapScanTruncated:Date.parse(cursor.start)>priorEnd});
    if(missing.length)console.warn(JSON.stringify({type:'BRIEFING_SCHEDULE_GAP',feedId:id,observedAt:now.toISOString(),missingWindowEnds:missing.map(w=>w.end)}));
  });
  });
  if(!savedRequest&&!boundary.some(row=>row.kind==='editions'))pending=await feedTransact(store,id,async tx=>{
   const existing=await tx.read<BriefingRequest>('briefing_requests',editionId);
   if(existing)return existing.state==='PENDING';
   if(await tx.read('editions',editionId))return false;
   const request:BriefingRequest={id:editionId,feedId:id,window,state:'PENDING',attempts:0,createdAt:now.toISOString(),engine:productV3Enabled(env)?'v3':'v2'};
   await tx.write('briefing_requests',editionId,request);
   return true;
  });
  if(catchup&&pending){
   let catchupSettling=true;
   await maintenance(id,'V3_BACKLOG_CATCHUP',async()=>{
    const superseded=await supersedeUnstartedV3Windows(store,id,editionId,now.toISOString(),isAutomaticReportingWindow);
    catchupSettling=superseded.length===V3_CATCHUP_LIMIT;
    if(superseded.length)console.info(JSON.stringify({type:'V3_BACKLOG_CATCHUP',feedId:id,targetWindowId:editionId,superseded:superseded.length,policy:'v3-unstarted-backlog-v1'}));
   });
   if(catchupSettling)continue;
  }
  const current=pending?await store.read<BriefingRequest>(id,'briefing_requests',editionId):undefined;
  if(env.WINDOW_READINESS_MODE&&current?.state==='PENDING')
   await maintenance(id,'WINDOW_READINESS_SHADOW',()=>observeWindowReadiness(env,current,now));
  if(current?.state==='PENDING'&&isIntakeStatus(current.reason)){
   const settings={v3:current.engine==='v3',now:now.toISOString()};
   // Refresh the diagnostic snapshot when readiness changes. Repeated ticks
   // only check live jobs. The final commit still recomputes exact coverage.
   if(!current.coverage||Boolean(current.coverage.pendingJobs)!==await windowHasHoldingJobs(env.DB,id,window.end,settings)){
    await feedTransact(store,id,async tx=>{
     const request=await tx.read<BriefingRequest>('briefing_requests',editionId);
     if(request?.state!=='PENDING'||!isIntakeStatus(request.reason))return;
     const coverage=await windowIntakeCoverage(env.DB,id,window.end,settings);
     const reason=coverage.pendingJobs?intakeWaitReason:coverage.failedJobs?incompleteIntakeReason:undefined;
     if(canonicalJson(request.coverage)!==canonicalJson(coverage)||request.reason!==reason)
      await tx.write('briefing_requests',editionId,{...request,coverage,reason});
    });
   }
  }
  const requests=await store.pendingBriefingRequests(id);
  for(const request of orderedPendingWindows(requests,now.toISOString()).filter(r=>isAutomaticReportingWindow(r.window))) {
   if(await editorialWindowAwaitingRecovery(env.DB,id,request.window,request.reason))continue;
   if(request.reason==='ACCOUNT_AUTHORIZATION_REQUIRED'){
    try{await modelSpendingAccount(env.DB,(request.engine==='v3'||!request.engine&&productV3Enabled(env))?productV3Models(env).editor:llmRoute(env,'editorial').identity,now.toISOString());await feedTransact(store,id,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',request.id);if(current?.state==='PENDING'&&current.reason==='ACCOUNT_AUTHORIZATION_REQUIRED'){const {reason:_,...rest}=current;await tx.write('briefing_requests',request.id,rest)}})}catch(error){if(!(error instanceof ModelSpendingWait))throw error}
   }

   // Each window is held only by jobs for evidence that existed when it closed.
   if(await windowHasHoldingJobs(env.DB,id,request.window.end,{v3:request.engine==='v3',now:now.toISOString()})&&!await preparedV3Delivery(env.DB,id,request.id,now.getTime()))continue;
   const v3=request.engine==='v3'||!request.engine&&productV3Enabled(env);
   if((v3||request.requireModel||env.V1_REAL_MODEL_REQUIRED==='true')&&!(v3?productV3Ready(env):createStoredEvidenceModel(env))){
    if(request.reason!=='MODEL_SETUP_REQUIRED')await feedTransact(store,id,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',request.id);if(current?.state==='PENDING')await tx.write('briefing_requests',request.id,{...current,reason:'MODEL_SETUP_REQUIRED'});});
    continue;
   }
   if(request.reason==='MODEL_SETUP_REQUIRED')await feedTransact(store,id,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',request.id);if(current?.state==='PENDING'&&current.reason==='MODEL_SETUP_REQUIRED'){const {reason:_setup,...rest}=current;await tx.write('briefing_requests',request.id,rest)}});
   const job=await store.read<{state:string;leaseUntil:string;pendingCall?:string}>(id,'synthesis_jobs',request.id);
   const retained=job?.pendingCall?await store.read<{status:string;usage?:{reported:boolean}}>(id,'semantic_results',job.pendingCall)??await store.read<{status:string;usage?:{reported:boolean}}>(id,'semantic_settlements',job.pendingCall):undefined;
   const settledSuccess=retained?.status==='SUCCEEDED'&&retained.usage?.reported===true;
   if(job?.state==='FAILED')continue;
   if(job?.state==='RUNNING' && Date.parse(job.leaseUntil)>now.getTime())break;
   if(job?.pendingCall&&!settledSuccess)continue;
   // A live dispatch lease means the oldest runnable window already owns this
   // feed's publication turn. Do not enqueue the next window alongside it.
   if(!await enqueueV1(env,'v1_briefing',request.id,{type:'v1_briefing',feedId:id,window:request.window} satisfies DistilledQueueMessage,now))break;sent++;
   break;
  }
 }
 return sent;
}
