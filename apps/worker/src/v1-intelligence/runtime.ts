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
import {publishSelection} from './publication';
import {createStoredEvidenceModel} from './model';
import {createSemanticSalienceScorer} from './salience-runtime';
import type {EventSalienceScorer} from './salience';
import {SalienceContentionError} from './salience-persistence';
import {SynthesisCompatibilityError} from './language';
import {projectEditionLedger} from './ledger';
import {prepareSemanticMatch} from './semantic-preparation';
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
interface BriefingRequest {id:string;feedId:string;window:PublicationWindow;state:'PENDING'|'DONE'|'FAILED';attempts:number;nextAttemptAt?:string;failure?:string;createdAt:string}
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
 const id=JSON.stringify([request.id,attempt]);
 await feedTransact(store,feedId,async tx=>{if(!await tx.read('rematch_attempts',id))await tx.write('rematch_attempts',id,{id,feedId,requestId,attempt,state:succeeded?'SUCCEEDED':!active||attempt>=3?'EXHAUSTED':'DEFERRED',nextAttemptAt:succeeded?undefined:new Date(Date.parse(now)+300000*2**(attempt-1)).toISOString(),createdAt:now,reason:active?prepared?.prepared.decision.provenance.fallbackReason:'STALE_EVIDENCE'} satisfies RematchAttempt)});
}
export async function processV1Briefing(env:Env,raw:V1BriefingMessage,now=()=>new Date().toISOString(),salienceScorer?:EventSalienceScorer) {
 const parsed=messageSchema.safeParse(raw);if(!parsed.success) throw new HandoffError('INVALID_REQUEST');
 const {feedId,window}=parsed.data;
 if(Date.parse(window.end)>Date.parse(now()) || Date.parse(window.start)>=Date.parse(window.end) || Date.parse(window.end)-Date.parse(window.start)>7*86400000) throw new HandoffError('INVALID_REQUEST');
 await approvedFeed(env,feedId);const store=new V1FeedStore(env.DB),id=await windowIdentity(feedId,window);
 const existing=await store.read<import('./publication').BriefingEditionRecord>(feedId,'editions',id);
 if(existing) {
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
 try {
  const shortlist=env.V1_EDITORIAL_PLAN_ENABLED==='true' || env.V1_SEMANTIC_POLICY!=='DETERMINISTIC' && (env.OPENROUTER_API_KEY || env.V1_SEMANTIC_POLICY==='SEMANTIC')?await prepareSemanticShortlist(store,feedId,window,now()):undefined;
  const plan=shortlist?await prepareEditorialPlan(store,shortlist,DEFAULT_BRIEFING_BUDGET,now(),createStrongSemanticModel(env)):undefined;
  const selection=await scoreAndSelect(store,feedId,window,DEFAULT_BRIEFING_BUDGET,now(),salienceScorer??createSemanticSalienceScorer(env),plan);
  if(!selection.selectedCandidateIds.length && selection.deferredProtectedTargetIds?.length)throw new HandoffError('TEMPORARY_UNAVAILABLE');
  const edition=selection.selectedCandidateIds.length?await publishSelection(store,feedId,selection.id,{now,model:createStoredEvidenceModel(env)}):undefined;
  if(edition)await projectEditionLedger(store,feedId,edition.id);
  await feedTransact(store,feedId,async tx=>{const current=await tx.read<BriefingRequest>('briefing_requests',id);if(current) await tx.write('briefing_requests',id,{...current,state:'DONE'})});return edition;
 } catch(error) {
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
/** Relay uses durable pending jobs and edition/window identities on the existing queue. */
export async function dispatchV1Intelligence(env:Env,now=new Date()):Promise<number> {
 if(env.V1_DOWNSTREAM_ENABLED!=='true') return 0;
 const sourceIds=[...new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean))];if(sourceIds.length>10) return 0;
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
  const rematches=await store.list<RematchRequest>(id,'rematch_requests'),attempts=await store.list<RematchAttempt>(id,'rematch_attempts');
  for(const request of rematches.filter(r=>nextRematch(r,attempts,now.toISOString())).slice(0,2)){await env.PROCESSING_QUEUE.send({type:'v1_rematch',feedId:id,requestId:request.id});sent++}
  // Reassessment must finish first; the next bounded relay publishes its result.
  const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(j.json,'$.state') IN ('PENDING','RUNNING') AND COALESCE(json_extract(j.json,'$.exhausted'),0)=0").bind(id).first<{n:number}>();
  if(pending?.n) continue;
  // Historical weekly windows remain callable/reproducible, but are not a new
  // live scheduling option. Existing UTC schedules remain unchanged otherwise.
  if(!feed.briefingSchedule && feed.briefingFrequency==='WEEKLY') continue;
  const window=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now),editionId=await windowIdentity(id,window);
  if(!await store.read(id,'editions',editionId)) await feedTransact(store,id,async tx=>{
   if(!await tx.read('briefing_requests',editionId)) await tx.write('briefing_requests',editionId,{id:editionId,feedId:id,window,state:'PENDING',attempts:0,createdAt:now.toISOString()} satisfies BriefingRequest);
  });
  const requests=await store.list<BriefingRequest>(id,'briefing_requests');
  let briefingSends=0;
  for(const request of requests.filter(r=>r.state==='PENDING' && (!r.nextAttemptAt || Date.parse(r.nextAttemptAt)<=now.getTime()))) {
   const job=await store.read<{state:string;leaseUntil:string;pendingCall?:string}>(id,'synthesis_jobs',request.id);
   if(job?.state==='FAILED' || job?.pendingCall || job?.state==='RUNNING' && Date.parse(job.leaseUntil)>now.getTime()) continue;
   await env.PROCESSING_QUEUE.send({type:'v1_briefing',feedId:id,window:request.window} satisfies DistilledQueueMessage);sent++;briefingSends++;
   if(briefingSends===2) break;
  }
 }
 return sent;
}
