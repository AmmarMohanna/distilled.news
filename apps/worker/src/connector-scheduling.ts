import {sha256,HandoffError} from '@distilled/contracts';
import type {Env,DistilledQueueMessage} from './types';
import {createConnectorRuntime,runConnectorMaintenance} from './connector-runtime';
import {dispatchV1Acquisitions} from './v1-downstream-runtime';
import {dispatchV1Intelligence} from './v1-intelligence/runtime';

export type ConnectorQueueMessage={type:'connector_feed';feedId:string;token:string}|{type:'connector_poll';feedId:string;jobId:string;table:'rss'|'provider';token:string};
const tables={rss:'connector_rss_poll_jobs',provider:'connector_provider_poll_jobs'} as const;
const DELIVERY_LEASE_MS=120_000;
const POLL_DELIVERY_MS=360_000;
export const FEED_DISPATCH_BATCH=100;

/** Indexed feed round-robin: expensive collection happens in queue consumers,
 * never inside Cron. One crashed delivery remains discoverable after expiry. */
export async function dispatchConnectorFeeds(env:Env,now=Date.now(),limit=FEED_DISPATCH_BATCH){
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return 0;
 if(!env.SOURCE_COLLECTION_QUEUE)throw Error('SOURCE_COLLECTION_QUEUE_REQUIRED');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_DISPATCH_LIMIT');
 let sent=0;
 const token=crypto.randomUUID();
 const rows=await env.DB.prepare(`UPDATE connector_feed_schedule SET due_ms=?,token=? WHERE feed_id IN
  (SELECT feed_id FROM connector_feed_schedule WHERE due_ms<=? ORDER BY due_ms,feed_id LIMIT ?) RETURNING feed_id`).bind(now+DELIVERY_LEASE_MS,token,now,limit).all<{feed_id:string}>();
 if(!rows.results.length)return 0;
 try{await env.SOURCE_COLLECTION_QUEUE.sendBatch(rows.results.map(row=>({body:{type:'connector_feed',feedId:row.feed_id,token} as ConnectorQueueMessage})));sent=rows.results.length;}
 catch(error){await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=?,last_error=? WHERE token=?').bind(now+30_000,'QUEUE_SEND_FAILED',token).run();throw error;}
 return sent;
}

/** Existing canonical runners own processing. This proxy only coalesces queue
 * delivery, so the other owner's intelligence runtime needs no modification. */
export function coalescedProcessingQueue(env:Env,now=Date.now()):Queue<DistilledQueueMessage>{
 const original=env.PROCESSING_QUEUE;
 return {send:async(body:DistilledQueueMessage,options?:QueueSendOptions)=>{
  if(!body.type?.startsWith('v1_'))return original.send(body,options);
  const id=await sha256(JSON.stringify(body)),token=crypto.randomUUID();
  if(body.type==='v1_briefing'&&!await collectionReadyForWindow(env,body.feedId,body.window.end,id,now))return;
  const claimed=await env.DB.prepare(`INSERT INTO connector_queue_dispatch(kind,id,available_ms,token) VALUES(?,?,?,?)
   ON CONFLICT(kind,id) DO UPDATE SET available_ms=excluded.available_ms,token=excluded.token,sends=sends+1,last_error=NULL WHERE available_ms<=? RETURNING id`).bind(body.type,id,now+DELIVERY_LEASE_MS,token,now).first();
  if(!claimed)return;
  try{await original.send(body,options)}catch(error){await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=?,last_error=? WHERE kind=? AND id=? AND token=?').bind(now+30_000,'QUEUE_SEND_FAILED',body.type,id,token).run();throw error;}
 },sendBatch:original.sendBatch.bind(original)} as Queue<DistilledQueueMessage>;
}

/** Publication must not silently call an uncollected window "quiet". Later
 * collection windows do not hold this boundary; blocked sources are reported
 * separately as unavailable and remain visible to operators/readers. */
export async function collectionReadyForWindow(env:Env,feedId:string,end:string,id:string,now=Date.now()){
 let pending=0;
 for(const table of Object.values(tables)){
  const row=await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} j JOIN sources s ON s.id=json_extract(j.request,'$.scope.feedSourceId')
   WHERE json_extract(j.request,'$.scope.feedId')=? AND j.state='PENDING' AND s.enabled=1 AND s.collection_owner='connector'
   AND (j.scheduled_at='' OR j.scheduled_at<?)` ).bind(feedId,end).first<{n:number}>();pending+=row?.n??0;
 }
 if(pending)await env.DB.prepare('INSERT INTO connector_publication_waits(request_id,feed_id,window_end,pending_collections,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET pending_collections=excluded.pending_collections,checked_at=excluded.checked_at WHERE pending_collections<>excluded.pending_collections').bind(id,feedId,end,pending,new Date(now).toISOString()).run();
 else await env.DB.prepare('DELETE FROM connector_publication_waits WHERE request_id=?').bind(id).run();
 return pending===0;
}

async function feedEnv(env:Env,feedId:string):Promise<Env|undefined>{
 const owner=await env.DB.prepare('SELECT b.owner_account_id FROM briefings b JOIN accounts a ON a.id=b.owner_account_id WHERE b.id=? AND b.paused=0 AND a.disabled_at IS NULL').bind(feedId).first();
 if(!owner)return;
 const rows=await env.DB.prepare("SELECT id FROM sources WHERE briefing_id=? AND collection_owner='connector' AND enabled=1 ORDER BY id").bind(feedId).all<{id:string}>();
 if(!rows.results.length)return;
 return {...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:rows.results.map(row=>row.id).join(','),PROCESSING_QUEUE:coalescedProcessingQueue(env)};
}

export async function connectorDownstreamEnv(env:Env,body:DistilledQueueMessage):Promise<Env>{
 if(!body||typeof body!=='object')return env;
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!body.type?.startsWith('v1_'))return env;
 let feedId='feedId' in body?String(body.feedId):undefined;
 if('jobId' in body){const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();feedId=row?.feed_id;}
 const scoped=feedId?await feedEnv(env,feedId):undefined;
 if(!scoped)throw new HandoffError('SCOPE_DENIED');
 return scoped;
}

/** Indexed per-feed pending-job discovery keeps a prolific feed from taking all
 * dispatch slots. Stable poll IDs retain paid submission/pagination identities. */
export async function dispatchConnectorPolls(env:Env,feedId:string,now=Date.now(),perKind=4){
 if(!env.SOURCE_COLLECTION_QUEUE)throw Error('SOURCE_COLLECTION_QUEUE_REQUIRED');
 let sent=0;
 for(const kind of ['rss','provider'] as const){
  const table=tables[kind],token=crypto.randomUUID();
  const rows=await env.DB.prepare(`UPDATE ${table} SET dispatch_until=?,dispatch_token=? WHERE job_id IN (
   SELECT job_id FROM ${table} WHERE json_extract(request,'$.scope.feedId')=? AND state='PENDING' AND due_at<=?
   AND dispatch_until<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY due_at,job_id LIMIT ?) RETURNING job_id`)
   .bind(now+POLL_DELIVERY_MS,token,feedId,new Date(now).toISOString(),now,new Date(now).toISOString(),perKind).all<{job_id:string}>();
  if(!rows.results.length)continue;
  try{await env.SOURCE_COLLECTION_QUEUE.sendBatch(rows.results.map(row=>({body:{type:'connector_poll',feedId,jobId:row.job_id,table:kind,token} as ConnectorQueueMessage})));sent+=rows.results.length;}
  catch(error){await env.DB.prepare(`UPDATE ${table} SET dispatch_until=?,dispatch_token=NULL WHERE dispatch_token=?`).bind(now+30_000,token).run();throw error;}
 }
 return sent;
}

/** Coordination interface: feed-scoped environment + existing dispatchers.
 * Canonical intelligence/window policy stays owned by v1-intelligence/runtime. */
export async function relayConnectorDownstream(env:Env){
 await dispatchV1Acquisitions(env);
 await dispatchV1Intelligence(env);
}

export async function processConnectorMessage(env:Env,body:ConnectorQueueMessage){
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')throw Error('CONNECTOR_SCHEDULER_DISABLED');
 if(body.type==='connector_feed'){
  const workToken=crypto.randomUUID();
  const claimed=await env.DB.prepare('UPDATE connector_feed_schedule SET processing_token=?,processing_until=? WHERE feed_id=? AND token=? AND processing_until<=? RETURNING token').bind(workToken,Date.now()+DELIVERY_LEASE_MS,body.feedId,body.token,Date.now()).first();
  if(!claimed)return;
  try{
   const scoped=await feedEnv(env,body.feedId);
   if(scoped){await runConnectorMaintenance(scoped,new Date(),{scheduleOnly:true});await dispatchConnectorPolls(scoped,body.feedId);await relayConnectorDownstream(scoped);}
   await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=?,token=NULL,last_error=NULL,attempts=0 WHERE feed_id=? AND token=? AND processing_token=?').bind(Date.now()+(scoped?60_000:300_000),body.feedId,body.token,workToken).run();
  }finally{await env.DB.prepare('UPDATE connector_feed_schedule SET processing_until=0,processing_token=NULL WHERE feed_id=? AND processing_token=?').bind(body.feedId,workToken).run();}
 }else{
  if(!Object.hasOwn(tables,body.table))throw Error('INVALID_CONNECTOR_MESSAGE');
  const table=tables[body.table];
  const job=await env.DB.prepare(`SELECT job_id FROM ${table} WHERE job_id=? AND dispatch_token=? AND json_extract(request,'$.scope.feedId')=?`).bind(body.jobId,body.token,body.feedId).first();
  if(!job)return;
  const scoped=await feedEnv(env,body.feedId);
  if(!scoped){await env.DB.prepare(`UPDATE ${table} SET state='CANCELLED',dispatch_until=0,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?`).bind(body.jobId,body.token).run();return;}
  const backend=createConnectorRuntime(scoped);
  // Budget configuration is installed before scheduling, never by a source input.
  const state=await (body.table==='rss'?backend.rssScheduler:backend.scheduler).runOne(300_000,body.jobId);
  await env.DB.prepare(`UPDATE ${table} SET dispatch_until=0,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?`).bind(body.jobId,body.token).run();
  if(state==='LEASE_LOST')throw new HandoffError('TEMPORARY_UNAVAILABLE');
  // Finish one page, then yield: other feeds run before this continuation.
  await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=MIN(due_ms,?) WHERE feed_id=? AND token IS NULL').bind(Date.now(),body.feedId).run();
 }
}

export async function recordConnectorQueueFailure(env:Env,id:string,body:ConnectorQueueMessage,attempts:number){
 await env.DB.prepare('INSERT INTO connector_queue_recovery(id,kind,feed_id,job_id,attempts,reason,observed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,observed_at=excluded.observed_at')
 .bind(id,body.type,body.feedId,body.type==='connector_poll'?body.jobId:null,attempts,'QUEUE_DELIVERY_FAILED',new Date().toISOString()).run();
}

export async function completeConnectorDownstream(env:Env,body:DistilledQueueMessage){
 if(!body.type?.startsWith('v1_'))return;
 await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=0 WHERE kind=? AND id=?').bind(body.type,await sha256(JSON.stringify(body))).run();
 if('jobId' in body){
  const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();
  if(row)await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=MIN(due_ms,?) WHERE feed_id=? AND token IS NULL').bind(Date.now(),row.feed_id).run();
 }
}

/** Delivery bookkeeping is disposable; canonical jobs and financial ledgers
 * remain the durable authority and are never deleted by this cleanup. */
export async function expireConnectorDeliveries(env:Env,now=Date.now()){
 await env.DB.prepare('DELETE FROM connector_queue_dispatch WHERE (kind,id) IN (SELECT kind,id FROM connector_queue_dispatch WHERE available_ms<? ORDER BY available_ms LIMIT 1000)').bind(now-86400_000).run();
 await env.DB.prepare('DELETE FROM connector_queue_recovery WHERE id IN (SELECT id FROM connector_queue_recovery WHERE observed_at<? ORDER BY observed_at LIMIT 1000)').bind(new Date(now-30*86400_000).toISOString()).run();
}

/** Operator recovery resumes the immutable job, never allocates a replacement
 * paid operation. Unknown submissions need provider reconciliation first. */
export async function recoverConnectorPoll(env:Env,kind:'rss'|'provider',jobId:string){
 const table=tables[kind];
 if(!table)throw Error('INVALID_POLL_KIND');
 const row=await env.DB.prepare(`SELECT request,state,last_error,lease_until FROM ${table} WHERE job_id=?`).bind(jobId).first<{request:string;state:string;last_error:string|null;lease_until:string|null}>();
 if(!row)throw Error('POLL_NOT_FOUND');
 if(row.state==='DONE'||row.state==='CANCELLED')throw Error('POLL_ALREADY_TERMINAL');
 if(row.lease_until&&Date.parse(row.lease_until)>Date.now())throw Error('POLL_LEASE_ACTIVE');
 if(row.last_error==='UNCERTAIN_PAID_SUBMISSION')throw Error('PAID_RECONCILIATION_REQUIRED');
 const request=JSON.parse(row.request);
 const {authorizeConnectorSource}=await import('./connector-runtime');
 if(!await authorizeConnectorSource(env,request))throw Error('SOURCE_NOT_APPROVED');
 await env.DB.prepare(`UPDATE ${table} SET state='PENDING',due_at=?,dispatch_until=0,dispatch_token=NULL,attempts=0,last_error=NULL WHERE job_id=? AND (lease_until IS NULL OR lease_until<=?)`).bind(new Date().toISOString(),jobId,new Date().toISOString()).run();
 await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=0 WHERE feed_id=? AND token IS NULL').bind(request.scope.feedId).run();
}
