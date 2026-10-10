import {HandoffError,sha256} from '@distilled/contracts';
import {z} from 'zod';
import type {Env,DistilledQueueMessage} from '../types';
import {v1SourceEnabled} from '../v1-downstream-runtime';
import {V1IntakeStore} from '../v1-intake/store';
import {transact} from '../v1-intake/transaction';
import type {DownstreamJob} from '../v1-intake/types';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore,feedTransact} from './store';
import {processEvidenceIntelligence} from './engine';
import {scoreAndSelect,DEFAULT_BRIEFING_BUDGET,type PublicationWindow} from './scoring';
import {publishSelection,QuietPublication} from './publication';
import {createStoredEvidenceModel} from './model';
import {createSemanticSalienceScorer} from './salience-runtime';
import type {EventSalienceScorer} from './salience';
import {SalienceContentionError} from './salience-persistence';
import {SynthesisCompatibilityError} from './language';
import {projectEditionLedger} from './ledger';
import {prepareSemanticMatch} from './semantic-preparation';
import {scheduleExtractionUpgrades,hasUnscheduledExtractionUpgrade} from './extraction-upgrade';
import {nextRematch,type RematchRequest,type RematchAttempt} from './rematch';
import {SemanticContentionError} from './semantic-operations';
import {prepareSemanticShortlist} from './shortlist';
import {prepareEditorialPlan} from './editorial-plan';
import {createStrongSemanticModel} from './semantic-model';
import type {FeedRecord} from './types';
import {synchronizeV1ProductSource} from './product';
import {publicationWindowSchema,livePublicationWindow} from './schedule';

export type V1BriefingMessage={type:'v1_briefing';feedId:string;window:PublicationWindow};
const messageSchema=z.object({type:z.literal('v1_briefing'),feedId:z.string().min(1),window:publicationWindowSchema}).strict();
interface BriefingRequest {id:string;feedId:string;window:PublicationWindow;state:'PENDING'|'DONE'|'FAILED';attempts:number;nextAttemptAt?:string;failure?:string;createdAt:string;requireModel?:boolean;result?:'QUIET'|'PUBLISHED'|'DEFERRED';reason?:string;completedAt?:string}
const windowIdentity=(feedId:string,window:PublicationWindow)=>sha256(canonicalJson({feedId,start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()}));
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
export async function processV1Reassessment(env:Env,id:string,now=new Date().toISOString()) {
 const intake=new V1IntakeStore(env.DB),row=await intake.read<DownstreamJob>('jobs',id);
 if(!row || row.value.kind!=='REASSESS' || row.value.state==='DONE' || row.value.exhausted || !v1SourceEnabled(env,row.feedSourceId)) return 'SKIPPED';
 await synchronizeV1ProductSource(env.DB,row.feedSourceId,now);
 const scope=await intake.snapshot(row.feedSourceId);await approvedFeed(env,scope.scope.feedId);
 try {const store=new V1FeedStore(env.DB),prepared=await prepareSemanticMatch(store,env,id,now);await processEvidenceIntelligence(store,id,now,prepared?.matchers);return 'DONE'}
 catch(error) {
  if(error instanceof SemanticContentionError)throw error;
  // Provider preparation is outside CAS; only canonical consumption retries.
  // Failure state and retry scheduling are durable, bounded and source-scoped.
  await transact(intake,row.feedSourceId,async tx=>{
   const job=await tx.read<DownstreamJob>('jobs',id);if(!job || job.state==='DONE' || job.exhausted) return;
   const attempts=job.attempts+1,terminal=attempts>=5 || error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE';
   tx.write('jobs',id,{...job,attempts,state:terminal?'FAILED':'PENDING',exhausted:terminal,failureCode:error instanceof HandoffError?error.code:'INTELLIGENCE_FAILED',nextAttemptAt:new Date(Date.parse(now)+30000*2**(attempts-1)).toISOString()});
  });
  if(error instanceof HandoffError) throw error;throw new HandoffError('TEMPORARY_UNAVAILABLE');
 }
}
export async function processV1Rematch(env:Env,feedId:string,requestId:string,now=new Date().toISOString()):Promise<void> {
 await approvedFeed(env,feedId);const store=new V1FeedStore(env.DB),request=await store.read<RematchRequest>(feedId,'rematch_requests',requestId);if(!request)return;
 const attempt=nextRematch(request,await store.list<RematchAttempt>(feedId,'rematch_attempts'),now);if(!attempt)return;
 const prepared=await prepareSemanticMatch(store,env,request.jobId,now,{attempt});
 const active=(await store.currentEvidence(feedId)).some(e=>e.revision.id===request.evidenceRevisionId);
 const eligible=active&&prepared&&prepared.prepared.decision.structuralRelation!=='DEFER';
 const consumed=eligible?await processEvidenceIntelligence(store,request.jobId,now,prepared.matchers,JSON.stringify([request.id,attempt])):undefined;
 const succeeded=Boolean(consumed&&consumed.decision==='PROCESSED'&&!consumed.semanticDeferred);
 const reason=!active?'STALE_EVIDENCE':succeeded?undefined:prepared?.prepared.decision.provenance.fallbackReason??(prepared?.prepared.decision.structuralRelation==='DEFER'?'SEMANTIC_IDENTITY_UNRESOLVED':consumed?.semanticDeferred?'SEMANTIC_CONSTRUCTION_UNRESOLVED':'SEMANTIC_PREPARATION_UNAVAILABLE'),budgetWait=active&&reason==='SEMANTIC_BUDGET_EXHAUSTED';
 const id=JSON.stringify([request.id,attempt,now.slice(0,10),'budget-aware-rematch-v1']);
 await feedTransact(store,feedId,async tx=>{if(!await tx.read('rematch_attempts',id))await tx.write('rematch_attempts',id,{id,feedId,requestId,attempt,state:succeeded?'SUCCEEDED':budgetWait?'WAITING_BUDGET':!active||attempt>=3?'EXHAUSTED':'DEFERRED',nextAttemptAt:succeeded?undefined:budgetWait?new Date(Date.parse(now.slice(0,10)+'T00:00:00Z')+86400000).toISOString():new Date(Date.parse(now)+300000*2**(attempt-1)).toISOString(),createdAt:now,reason} satisfies RematchAttempt)});
}
export async function processV1Briefing(env:Env,raw:V1BriefingMessage,now=()=>new Date().toISOString(),salienceScorer?:EventSalienceScorer,fetcher:typeof fetch=fetch,publicationOptions?:{requireModel?:boolean}) {
 const parsed=messageSchema.safeParse(raw);if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
 const {feedId,window}=parsed.data;
 if(Date.parse(window.end)>Date.parse(now()) || Date.parse(window.start)>=Date.parse(window.end) || Date.parse(window.end)-Date.parse(window.start)>7*86400000) throw new HandoffError('INVALID_REQUEST');
 await approvedFeed(env,feedId);const store=new V1FeedStore(env.DB),id=await windowIdentity(feedId,window);
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
  const prior=await tx.read<BriefingRequest>('briefing_requests',id);if(prior) return prior;
  const value:BriefingRequest={id,feedId,window,state:'PENDING',attempts:0,createdAt:now()};await tx.write('briefing_requests',id,value);return value;
 });
 if(request.state==='FAILED') throw new HandoffError('INVALID_REQUEST');
 if(request.state==='DONE') return undefined;
 let failureStage='SHORTLIST';
 try {
  // A configured writer model only ever sees the approved facts of an EditorialPlan, so model-backed synthesis implies the plan path;
  // the deterministic fallback plan is used when no strong planning model is available. The writer never fixes upstream selection.
  const writer=createStoredEvidenceModel(env,fetcher);
  const shortlist=env.V1_EDITORIAL_PLAN_ENABLED==='true' || writer || env.V1_SEMANTIC_POLICY!=='DETERMINISTIC' && (env.OPENROUTER_API_KEY || env.V1_SEMANTIC_POLICY==='SEMANTIC')?await prepareSemanticShortlist(store,feedId,window,now(),20,env,fetcher):undefined;
  failureStage='EDITORIAL_PLAN';
  const plan=shortlist?await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,now(),createStrongSemanticModel(env,fetcher,'EDITORIAL')):undefined;
  if(required&&shortlist?.candidates.length&&plan?.route!=='GPT')throw new HandoffError('TEMPORARY_UNAVAILABLE');
  failureStage='SELECTION';
  const selection=await scoreAndSelect(store,feedId,window,DEFAULT_BRIEFING_BUDGET,now(),salienceScorer??createSemanticSalienceScorer(env),plan);
  if(!selection.selectedCandidateIds.length && selection.deferredProtectedTargetIds?.length)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  failureStage='SYNTHESIS_PUBLICATION';
  const edition=selection.selectedCandidateIds.length?await publishSelection(store,feedId,selection.id,{now,model:writer,requireModel:required}):undefined;
  failureStage='LEDGER_PROJECTION';
  if(edition)await projectEditionLedger(store,feedId,edition.id);
  const deferred=!edition&&(plan?.stories.some(story=>story.decision==='DEFER')||Boolean(shortlist?.overflow.length));
  await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current) await tx.write('briefing_requests',id,{...current,state:'DONE',result:edition?'PUBLISHED':deferred?'DEFERRED':'QUIET',reason:edition?undefined:deferred?'EDITORIAL_WORK_DEFERRED':'NO_SELECTED_DEVELOPMENTS',completedAt:now()})});return edition;
 } catch(error) {
  if(error instanceof QuietPublication)return undefined;
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
}
/** Auxiliary per-Feed maintenance (policy upgrades, rematch fan-out) must never prevent briefing dispatch:
 * a contended or failing maintenance step is reported and retried on the next tick, while the window requests
 * below keep being sent. Their durable state is untouched, so nothing is skipped or duplicated. */
async function maintenance(feedId:string,step:string,run:()=>Promise<void>):Promise<void> {
 try{await run()}catch(error){console.error(JSON.stringify({type:'V1_DISPATCH_MAINTENANCE_FAILED',feedId,step,error:error instanceof Error?error.message:'UNKNOWN'}))}
}
/** Intake/reassessment jobs that can still change what a window contains: unfinished, non-exhausted jobs
 * for evidence observed before the window closed (or whose observation time is unknown). Evidence that
 * arrived later belongs to a later window, so continuous arrivals cannot postpone an earlier boundary, and
 * nothing is lost: that job keeps running on the ordinary queue and its Event lands in the next window. */
async function jobsHoldingWindow(db:Env['DB'],feedId:string,windowEnd:string):Promise<number> {
 const row=await db.prepare("SELECT COUNT(*) AS n FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(j.json,'$.state') IN ('PENDING','RUNNING') AND COALESCE(json_extract(j.json,'$.exhausted'),0)=0 AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(?))").bind(feedId,windowEnd).first<{n:number}>();
 return row?.n??0;
}
const windowEndOf=(feed:{briefingSchedule?:unknown;briefingFrequency:string},now:Date)=>(feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule as never,now):publicationWindow(feed.briefingFrequency as never,now)).end;
/** Relay uses durable pending jobs and edition/window identities on the existing queue. */
export async function dispatchV1Intelligence(env:Env,now=new Date()):Promise<number> {
 if(env.V1_DOWNSTREAM_ENABLED!=='true') return 0;
 const sourceIds=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];
 const feeds=new Set<string>();let sent=0;
 for(const id of sourceIds) {
  try {await synchronizeV1ProductSource(env.DB,id,now.toISOString())} catch(error) {if(error instanceof HandoffError && ['SCOPE_DENIED','IDEMPOTENCY_CONFLICT','INVALID_REQUEST'].includes(error.code)) continue;throw error}
  const scope=await new V1IntakeStore(env.DB).getScope(id);if(!scope?.enabled || scope.deletedAt) continue;feeds.add(scope.feedId);
  const rows=await env.DB.prepare("SELECT id FROM v1_jobs WHERE feed_source_id=? AND json_extract(json,'$.kind')='REASSESS' AND json_extract(json,'$.state')='PENDING' AND COALESCE(json_extract(json,'$.exhausted'),0)=0 AND (json_extract(json,'$.nextAttemptAt') IS NULL OR json_extract(json,'$.nextAttemptAt')<=?) ORDER BY id LIMIT 5").bind(id,now.toISOString()).all<{id:string}>();
  for(const job of rows.results) {await env.PROCESSING_QUEUE.send({type:'v1_reassess',jobId:job.id});sent++}
 }
 const store=new V1FeedStore(env.DB);
 for(const id of feeds) {
  const feed=await store.getFeed(id);if(!feed || feed.paused || feed.deletedAt) continue;
  try {await approvedFeed(env,id)} catch(error) {if(error instanceof HandoffError && error.code==='SCOPE_DENIED') continue;throw error}
  await maintenance(id,'EXTRACTION_UPGRADE',async()=>{
   if(feed.briefingSchedule||feed.briefingFrequency!=='WEEKLY'){const upgradeWindow=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now);if(await hasUnscheduledExtractionUpgrade(store,id,upgradeWindow))await feedTransact(store,id,tx=>scheduleExtractionUpgrades(tx,upgradeWindow,now.toISOString()))}
  });
  await maintenance(id,'REMATCH_DISPATCH',async()=>{
    const rematches=await store.list<RematchRequest>(id,'rematch_requests'),attempts=await store.list<RematchAttempt>(id,'rematch_attempts');
    for(const request of rematches.filter(r=>nextRematch(r,attempts,now.toISOString())).slice(0,2)){await env.PROCESSING_QUEUE.send({type:'v1_rematch',feedId:id,requestId:request.id});sent++}
  });
  // Reassessment must finish first; the next bounded relay publishes its result.
  const pending={n:await jobsHoldingWindow(env.DB,id,windowEndOf(feed,now))};
  // Historical weekly windows remain callable/reproducible, but are not a new
  // live scheduling option. Existing UTC schedules remain unchanged otherwise.
  if(!feed.briefingSchedule && feed.briefingFrequency==='WEEKLY') continue;
  const window=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now),editionId=await windowIdentity(id,window);
  // Record the observed boundary even while intake is busy. A gap is an
  // observation made NOW, not a fabricated historical request or quiet result.
  await maintenance(id,'SCHEDULE_OBSERVATION',async()=>{
   await feedTransact(store,id,async tx=>{
   const observationId=JSON.stringify([id,feed.revision,window.end]);if(await tx.read('schedule_observations',observationId))return;
   const prior=(await tx.list<{id:string;feedRevision:number;window:PublicationWindow;createdAt:string}>('schedule_observations')).filter(o=>o.feedRevision===feed.revision&&Date.parse(o.window.end)<Date.parse(window.end)).sort((a,b)=>b.window.end.localeCompare(a.window.end))[0];
   const missing:PublicationWindow[]=[];let cursor=window;
   for(let i=0;prior&&Date.parse(cursor.start)>Date.parse(prior.window.end)&&i<48;i++){
    cursor=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,new Date(Date.parse(cursor.start))):publicationWindow(feed.briefingFrequency,new Date(Date.parse(cursor.start)));
    if(!await tx.read('briefing_requests',await windowIdentity(id,cursor)))missing.push(cursor);
   }
   await tx.write('schedule_observations',observationId,{id:observationId,feedId:id,feedRevision:feed.revision,window,requestId:editionId,createdAt:now.toISOString(),state:'BOUNDARY_OBSERVED',schedulePolicy:feed.briefingSchedule??{briefingFrequency:feed.briefingFrequency},missingExpectedBoundaries:missing,gapScanLimit:48,gapScanTruncated:Boolean(prior&&Date.parse(cursor.start)>Date.parse(prior.window.end))});
   if(missing.length)console.warn(JSON.stringify({type:'BRIEFING_SCHEDULE_GAP',feedId:id,observedAt:now.toISOString(),missingWindowEnds:missing.map(w=>w.end)}));
  });
  });
  if(!await store.read(id,'editions',editionId)) await feedTransact(store,id,async tx=>{
   if(!await tx.read('briefing_requests',editionId)) await tx.write('briefing_requests',editionId,{id:editionId,feedId:id,window,state:'PENDING',attempts:0,createdAt:now.toISOString()} satisfies BriefingRequest);
  });
  // Reobserving an unchanged wait is read-only: an epoch bump every minute
  // would fence slow reassessment/publication work for other windows too.
  // A wait label is written once on entry and cleared once on release; unchanged observations stay read-only.
  const waiting=Boolean(pending?.n),current=await store.read<BriefingRequest>(id,'briefing_requests',editionId);
  if(current?.state==='PENDING'&&waiting!==(current.reason==='AWAITING_INTAKE_REASSESSMENT')&&(waiting||current.reason==='AWAITING_INTAKE_REASSESSMENT'))await feedTransact(store,id,async tx=>{const request=await tx.read<BriefingRequest>('briefing_requests',editionId);if(request?.state!=='PENDING')return;if(waiting&&request.reason!=='AWAITING_INTAKE_REASSESSMENT')await tx.write('briefing_requests',editionId,{...request,reason:'AWAITING_INTAKE_REASSESSMENT'});else if(!waiting&&request.reason==='AWAITING_INTAKE_REASSESSMENT'){const {reason:_released,...rest}=request;await tx.write('briefing_requests',editionId,rest)}});
  const requests=await store.list<BriefingRequest>(id,'briefing_requests');
  let briefingSends=0;
  for(const request of requests.filter(r=>r.state==='PENDING' && (!r.nextAttemptAt || Date.parse(r.nextAttemptAt)<=now.getTime()))) {
   // Each window is held only by jobs for evidence that existed when it closed.
   if(await jobsHoldingWindow(env.DB,id,request.window.end))continue;
   const job=await store.read<{state:string;leaseUntil:string;pendingCall?:string}>(id,'synthesis_jobs',request.id);
   if(job?.state==='FAILED' || job?.pendingCall || job?.state==='RUNNING' && Date.parse(job.leaseUntil)>now.getTime()) continue;
   await env.PROCESSING_QUEUE.send({type:'v1_briefing',feedId:id,window:request.window} satisfies DistilledQueueMessage);sent++;briefingSends++;
   if(briefingSends===2) break;
  }
 }
 return sent;
}
