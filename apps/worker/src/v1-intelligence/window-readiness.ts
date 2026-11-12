import {pendingWindowCollections} from '../connector-publication-coverage';
import type {Env} from '../types';
import type {BriefingRequest} from './runtime';
import {CLOCK_PREPARATION_POLICY,CLOCK_SCHEDULE_POLICY,DELIVERY_LEAD_MS} from './schedule';
import {preparedV3Delivery,windowHasHoldingJobs} from './window-coverage';

const DAY_MS=86_400_000;
const LEASE_MS=120_000;
const MAX_ACTIVE_WINDOWS=2;
const WAKE_BATCH=5;
const REPAIR_DELAY_MS=300_000;

export type WindowReadinessWake={type:'window_readiness_wake';eventId:string;feedId:string};

interface Projection {
  window_id:string;
  enrollment_id:string;
  generation:number;
  feed_revision:number;
  pending_acquisition:number;
  pending_review:number;
  failed:number;
  blocked:number;
  released:number;
  verified:number;
}

function enabled(env:Env,feedId?:string):boolean {
  if(env.WINDOW_READINESS_MODE!=='shadow'&&env.WINDOW_READINESS_MODE!=='relay')return false;
  if(feedId===undefined||!env.WINDOW_READINESS_FEED_IDS)return true;
  return env.WINDOW_READINESS_FEED_IDS.split(',').some(id=>id.trim()===feedId);
}

export async function readWindowReadiness(db:D1Database,id:string,now:number) {
  const row=await db.prepare(`SELECT w.window_id,w.enrollment_id,w.generation,w.feed_revision,
    w.pending_acquisition,w.pending_review,w.failed,w.blocked,w.verified,
    (SELECT COUNT(*) FROM v1_window_job_memberships m WHERE m.window_id=w.window_id AND m.capacity_at_ms<=?) AS released
    FROM v1_window_readiness w WHERE w.window_id=? AND w.enrollment_state='ACTIVE' AND w.expires_ms>?`)
    .bind(now,id,now).first<Projection>();
  if(!row)return undefined;
  return {...row,holding:row.pending_review>0||row.pending_acquisition>row.released};
}

/** Seed the exact canonical request once under a D1 transaction. The nonce
 * makes a competing enrollment a no-op and fences an expired/rebuilt window. */
async function enroll(db:D1Database,request:BriefingRequest,now:number,cutoff:number,delivery:number) {
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO v1_window_readiness(window_id,feed_id,feed_revision,enrollment_id,enrollment_state,cutoff,cutoff_ms,delivery_ms,expires_ms,not_before_ms)
      SELECT r.id,r.feed_id,json_extract(f.json,'$.revision'),?,'BUILDING',?,?,?,?,
        MAX(?,COALESCE(CAST(ROUND(unixepoch(json_extract(r.json,'$.nextAttemptAt'),'subsec')*1000) AS INTEGER),?))
      FROM v1_feed_documents r JOIN v1_feeds f ON f.id=r.feed_id
      WHERE r.kind='briefing_requests' AND r.id=? AND r.feed_id=? AND json_extract(r.json,'$.engine')='v3'
        AND json_extract(r.json,'$.state')='PENDING' AND json_extract(r.json,'$.window.end')=? AND json_extract(r.json,'$.window.scheduledFor')=?
        AND json_extract(f.json,'$.paused')=0 AND json_extract(f.json,'$.deletedAt') IS NULL
        AND (SELECT COUNT(*) FROM v1_window_readiness WHERE feed_id=r.feed_id AND expires_ms>?)<?
      ON CONFLICT(window_id) DO NOTHING`)
      .bind(id,request.window.end,cutoff,delivery,delivery+DAY_MS,cutoff,cutoff,request.id,request.feedId,request.window.end,request.window.scheduledFor,now,MAX_ACTIVE_WINDOWS),
    db.prepare(`INSERT INTO v1_window_job_memberships(window_id,job_id,job_revision,kind,capacity_at_ms)
      SELECT m.window_id,m.job_id,m.job_revision,m.bucket,m.capacity_at_ms FROM v1_window_job_matches m
      WHERE m.window_id=? AND m.bucket IN ('ACQUISITION','REVIEW')
        AND EXISTS(SELECT 1 FROM v1_window_readiness WHERE window_id=m.window_id AND enrollment_id=?)`)
      .bind(request.id,id),
    db.prepare(`UPDATE v1_window_readiness SET
      (pending_acquisition,pending_review,failed,blocked,capacity_eligible)=(
        SELECT COALESCE(SUM(bucket='ACQUISITION'),0),COALESCE(SUM(bucket='REVIEW'),0),COALESCE(SUM(bucket='FAILED'),0),
          COALESCE(SUM(bucket='BLOCKED'),0),COALESCE(SUM(capacity_at_ms IS NOT NULL),0)
        FROM v1_window_job_matches WHERE window_id=?),enrollment_state='ACTIVE',generation=1
      WHERE window_id=? AND enrollment_id=?`).bind(request.id,request.id,id),
  ]);
}

/** Shadow comparison is observational. An enrolled row is never used by a
 * publication guard. The canonical relay checks collection, evidence, clocks,
 * source scope and paid-operation ownership on every wake. */
export async function observeWindowReadiness(env:Env,request:BriefingRequest,now:Date):Promise<void> {
  if(!enabled(env,request.feedId)||request.engine!=='v3'||request.state!=='PENDING'||!request.window.scheduledFor)return;
  if(request.window.schedulePolicy!==CLOCK_SCHEDULE_POLICY&&request.window.schedulePolicy!==CLOCK_PREPARATION_POLICY)return;
  const cutoff=Date.parse(request.window.end),delivery=Date.parse(request.window.scheduledFor),at=now.getTime();
  if(delivery-cutoff!==DELIVERY_LEAD_MS||at<cutoff||at>=delivery+DAY_MS)return;
  let projection=await readWindowReadiness(env.DB,request.id,at);
  if(!projection){
    await enroll(env.DB,request,at,cutoff,delivery);
    projection=await readWindowReadiness(env.DB,request.id,at);
    if(!projection)return;
  }
  const collection=await pendingWindowCollections(env.DB,request.feedId,request.window.end,true,{scheduledFor:request.window.scheduledFor,now:at});
  const verified=await preparedV3Delivery(env.DB,request.feedId,request.id,Math.max(at,delivery));
  const deferAcquisition=verified&&at>=delivery;
  const canonicalHolding=await windowHasHoldingJobs(env.DB,request.feedId,request.window.end,{v3:true,now:now.toISOString(),deferAcquisition});
  const projectedHolding=deferAcquisition?projection.pending_review>0:projection.holding;
  const resolved=Number(collection.pending===0);
  const matched=canonicalHolding===projectedHolding;
  // A concurrent job, request or scope change invalidates this comparison. A
  // mismatch suppresses the additional wake and leaves canonical recovery live.
  const authority=[request.id,projection.enrollment_id,projection.generation] as const;
  const confirmed=matched
    ? await env.DB.prepare(`UPDATE v1_window_readiness SET collection_resolved=?,verified=?,generation=generation+1
        WHERE window_id=? AND enrollment_id=? AND generation=? AND (collection_resolved<>? OR verified<>?) RETURNING generation`)
        .bind(resolved,Number(verified),...authority,resolved,Number(verified)).first()
    : await env.DB.prepare(`UPDATE v1_window_readiness SET enrollment_state='STALE',repair_after_ms=?,generation=generation+1
        WHERE window_id=? AND enrollment_id=? AND generation=? RETURNING generation`)
        .bind(at+REPAIR_DELAY_MS,...authority).first();
  const stable=confirmed||(matched&&await env.DB.prepare('SELECT 1 FROM v1_window_readiness WHERE window_id=? AND enrollment_id=? AND generation=?')
    .bind(...authority).first());
  if(!stable)return;
  console[matched?'info':'warn'](JSON.stringify({type:'V1_WINDOW_READINESS_SHADOW',feedId:request.feedId,windowId:request.id,
    generation:projection.generation,feedRevision:projection.feed_revision,matched,canonicalHolding,projectedHolding,
    pendingAcquisition:projection.pending_acquisition,pendingReview:projection.pending_review,
    failed:projection.failed+projection.released,blocked:projection.blocked,
    deferred:deferAcquisition?projection.pending_acquisition-projection.released:0,
    collectionResolved:Boolean(resolved),verified,scheduledFor:request.window.scheduledFor,checkedAt:now.toISOString()}));
}

/** One bounded pass for expiry and delivery. Shadow runs record the same
 * transactional intents with zero queue sends. An accepted but unconsumed
 * wake becomes due again, including after a crash between send and ack. */
export async function sweepWindowReadiness(env:Env,now=new Date()):Promise<void> {
  if(!enabled(env))return;
  const at=now.getTime();
  await env.DB.prepare(`DELETE FROM v1_window_readiness WHERE window_id IN (
    SELECT window_id FROM v1_window_readiness WHERE expires_ms<=? ORDER BY expires_ms,window_id LIMIT 16)`)
    .bind(at).run();
  await env.DB.prepare(`DELETE FROM v1_window_readiness WHERE window_id IN (
    SELECT window_id FROM v1_window_readiness WHERE enrollment_state='STALE' AND repair_after_ms<=? ORDER BY repair_after_ms,window_id LIMIT 8)`)
    .bind(at).run();
  const queue=env.V1_ACQUISITION_QUEUE;
  if(env.WINDOW_READINESS_MODE!=='relay'||env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!queue)return;
  const cohort=env.WINDOW_READINESS_FEED_IDS?.split(',').map(id=>id.trim()).filter(Boolean);
  const candidates=await env.DB.prepare(`SELECT o.event_id,w.feed_id FROM v1_window_ready_outbox o
    JOIN v1_window_readiness w ON w.window_id=o.window_id AND w.generation=o.generation
    WHERE o.consumed_ms IS NULL AND o.due_ms<=? AND o.send_until_ms<=? AND o.consumer_until_ms<=? AND w.expires_ms>?
    ${cohort?'AND w.feed_id IN (SELECT value FROM json_each(?))':''}
    ORDER BY o.due_ms,o.window_id LIMIT ?`).bind(at,at,at,at,...(cohort?[JSON.stringify(cohort)]:[]),WAKE_BATCH).all<{event_id:string;feed_id:string}>();
  for(const candidate of candidates.results){
    const token=crypto.randomUUID();
    const claim=await env.DB.prepare(`UPDATE v1_window_ready_outbox SET send_token=?,send_until_ms=?,attempts=attempts+1
      WHERE event_id=? AND consumed_ms IS NULL AND due_ms<=? AND send_until_ms<=? AND consumer_until_ms<=? RETURNING attempts`)
      .bind(token,at+LEASE_MS,candidate.event_id,at,at,at).first<{attempts:number}>();
    if(!claim)continue;
    try{
      await queue.send({type:'window_readiness_wake',eventId:candidate.event_id,feedId:candidate.feed_id});
      await env.DB.prepare('UPDATE v1_window_ready_outbox SET sent_ms=?,send_token=NULL,send_until_ms=0,due_ms=? WHERE event_id=? AND send_token=?')
        .bind(at,at+LEASE_MS,candidate.event_id,token).run();
    }catch{
      const delay=Math.min(300_000,1000*2**Math.min(claim.attempts,8));
      await env.DB.prepare('UPDATE v1_window_ready_outbox SET send_token=NULL,send_until_ms=0,due_ms=? WHERE event_id=? AND send_token=?')
        .bind(at+delay,candidate.event_id,token).run();
    }
  }
}

export async function consumeWindowReadinessWake(env:Env,wake:WindowReadinessWake,relay:()=>Promise<void>,now=new Date()):Promise<void> {
  if(env.WINDOW_READINESS_MODE!=='relay'||env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!enabled(env,wake.feedId))return;
  const at=now.getTime(),token=crypto.randomUUID();
  const claim=await env.DB.prepare(`UPDATE v1_window_ready_outbox SET consumer_token=?,consumer_until_ms=?
    WHERE event_id=? AND consumed_ms IS NULL AND consumer_until_ms<=?
      AND EXISTS(SELECT 1 FROM v1_window_readiness w WHERE w.window_id=v1_window_ready_outbox.window_id
        AND w.generation=v1_window_ready_outbox.generation AND w.enrollment_state='ACTIVE'
        AND w.feed_id=? AND w.expires_ms>? AND w.not_before_ms<=?
        AND w.collection_resolved=1 AND w.pending_review=0
        AND ((w.verified=1 AND w.delivery_ms<=?) OR (w.verified=0 AND w.pending_acquisition=w.capacity_eligible
          AND NOT EXISTS(SELECT 1 FROM v1_window_job_memberships m WHERE m.window_id=w.window_id AND m.capacity_at_ms>?))))
    RETURNING event_id`).bind(token,at+LEASE_MS,wake.eventId,at,wake.feedId,at,at,at,at).first();
  if(!claim)return;
  try{
    await relay();
    await env.DB.prepare('UPDATE v1_window_ready_outbox SET consumed_ms=?,consumer_token=NULL,consumer_until_ms=0 WHERE event_id=? AND consumer_token=?')
      .bind(at,wake.eventId,token).run();
  }catch(error){
    await env.DB.prepare('UPDATE v1_window_ready_outbox SET consumer_token=NULL,consumer_until_ms=0 WHERE event_id=? AND consumer_token=?')
      .bind(wake.eventId,token).run();
    throw error;
  }
}
