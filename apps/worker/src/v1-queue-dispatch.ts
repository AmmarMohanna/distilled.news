import {sha256} from '@distilled/contracts';
import {canonicalJson} from './v1-intake/canonical';
import type {Env,DistilledQueueMessage} from './types';
/** Transport claim only: canonical processing still requires its own lease/CAS.
 * A crash before/after send recovers after expiry; a known failed send backs off.
 * No paid-operation identity, source checkpoint or Feed epoch changes here. */
export const DISPATCH_LEASE_MS=120_000;
export async function enqueueV1(env:Env,kind:string,id:string,body:DistilledQueueMessage,now=new Date()):Promise<boolean>{
 const token=crypto.randomUUID(),time=now.getTime();
 const claimed=await env.DB.prepare(`INSERT INTO v1_queue_dispatches(kind,id,token,lease_until,send_count) VALUES(?,?,?,?,1)
 ON CONFLICT(kind,id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until,send_count=send_count+1,last_failure=NULL
 WHERE lease_until<=? AND not_before<=? RETURNING token`).bind(kind,id,token,time+DISPATCH_LEASE_MS,time,time).first();
 if(!claimed)return false;
 try{await env.PROCESSING_QUEUE.send(body);return true}
 catch(error){await env.DB.prepare('UPDATE v1_queue_dispatches SET lease_until=0,not_before=?,last_failure=? WHERE kind=? AND id=? AND token=?').bind(time+30_000,'QUEUE_SEND_FAILED',kind,id,token).run();throw error}
}
/** Record transport exhaustion separately from semantic/resource uncertainty.
 * Canonical runners/leases own terminal state; Cron can recover a lost delivery.
 * Acknowledging an exhausted message must never hide that recovery obligation. */
export async function recordV1QueueOutcome(env:Env,messageId:string,body:Record<string,unknown>,attempts:number,reason:string):Promise<void>{
 const kind=String(body.type),window=body.window as {start?:string;end?:string}|undefined;
 const id=kind==='v1_briefing'&&window?.start&&window.end&&Number.isFinite(Date.parse(window.start))&&Number.isFinite(Date.parse(window.end))?await sha256(canonicalJson({feedId:body.feedId,start:new Date(window.start).toISOString(),end:new Date(window.end).toISOString()})):String(body.jobId??body.requestId??'UNKNOWN');
 const job=await env.DB.prepare("SELECT s.feed_id,json_extract(j.json,'$.state') AS state FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id WHERE j.id=?").bind(id).first<{feed_id:string;state:string}>();
 const outcome=job?.state==='FAILED'?'FAILED':attempts>=5?'DELIVERY_EXHAUSTED':reason!=='TEMPORARY_UNAVAILABLE'?'DELIVERY_REJECTED':'RETRYABLE_WAIT';
 await env.DB.prepare('INSERT INTO v1_queue_outcomes(message_id,kind,job_id,feed_id,attempts,outcome,reason,observed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(message_id,attempts) DO NOTHING').bind(messageId,kind,id,job?.feed_id??(typeof body.feedId==='string'?body.feedId:null),attempts,outcome,reason,new Date().toISOString()).run();
}

/** Ordering is transport fairness, never an editorial judgment. Every fifth
 * minute is oldest-first so continuous arrivals cannot starve historical work.
 * Active transport reservations are excluded before the bounded page limit. */
export async function pendingV1Jobs(env:Env,sourceId:string,kind:'ACQUIRE'|'REASSESS',now:Date):Promise<{id:string}[]> {
 const rows=await env.DB.prepare(`SELECT j.id FROM v1_jobs j
 JOIN v1_intake_scopes s ON s.id=j.feed_source_id
 LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id
 WHERE j.feed_source_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL
 AND json_extract(j.json,'$.kind')=? AND COALESCE(json_extract(j.json,'$.exhausted'),0)=0
 AND (json_extract(j.json,'$.state')='PENDING' OR (json_extract(j.json,'$.state')='RUNNING' AND json_extract(j.json,'$.leaseUntil')<=?))
 AND (json_extract(j.json,'$.nextAttemptAt') IS NULL OR json_extract(j.json,'$.nextAttemptAt')<=?)
 AND NOT EXISTS(SELECT 1 FROM v1_queue_dispatches d WHERE d.kind=? AND d.id=j.id AND (d.lease_until>? OR d.not_before>?))
 ORDER BY CASE WHEN ?=1 THEN 0 WHEN EXISTS(SELECT 1 FROM v1_feed_documents r
 WHERE r.feed_id=s.feed_id AND r.kind='briefing_requests' AND json_extract(r.json,'$.state')='PENDING'
 AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR
 (julianday(json_extract(i.json,'$.observation.observedAt'))>=julianday(json_extract(r.json,'$.window.start')) AND
 julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(json_extract(r.json,'$.window.end'))))) THEN 0 ELSE 1 END,
 CASE WHEN ?=1 THEN 0 WHEN json_extract(i.json,'$.observation.publishedAtHint') IS NULL OR julianday(json_extract(i.json,'$.observation.publishedAtHint'))>=julianday(?,'-2 days') THEN 0 ELSE 1 END,
 json_extract(i.json,'$.observation.observedAt'),j.id LIMIT 5`)
 .bind(sourceId,kind,now.toISOString(),now.toISOString(),kind==='ACQUIRE'?'v1_acquisition':'v1_reassess',now.getTime(),now.getTime(),now.getUTCMinutes()%5===0?1:0,now.getUTCMinutes()%5===0?1:0,now.toISOString()).all<{id:string}>();
 return rows.results;
}

/** Owned-feed diagnostics; no source content, provider payloads or credentials. */
export async function readV1QueueAudit(db:D1Database,feedId:string){
 const rows=await db.prepare('SELECT outcome,reason,COUNT(*) AS deliveries,MAX(observed_at) AS latestAt FROM v1_queue_outcomes WHERE feed_id=? GROUP BY outcome,reason').bind(feedId).all();
 return rows.results;
}
