import {unpaidSourceRecoveryEnv,unpaidPollRecoveryId} from './unpaid-source-recovery';
import {sha256,HandoffError} from '@distilled/contracts';
import type {Env,DistilledQueueMessage} from './types';
import {createConnectorRuntime,runConnectorMaintenance} from './connector-runtime';
import {dispatchV1Acquisitions} from './v1-downstream-runtime';
import {dispatchV1Intelligence} from './v1-intelligence/runtime';
import {dispatchTelegramLane} from './connector-telegram-lane';
import {requireConnectorQueues} from './connector-queue-config';
import {reserveConnectorWork,releaseConnectorWork} from './connector-work-admission';
import {pendingWindowCollections} from './connector-publication-coverage';
import {dispatchReadyConnectorBriefing} from './connector-briefing-priority';

export type ConnectorQueueMessage={type:'connector_feed';feedId:string;token:string}|{type:'connector_poll';feedId:string;jobId:string;table:'rss'|'provider';token:string}|{type:'connector_relay';feedId:string};
const tables={rss:'connector_rss_poll_jobs',provider:'connector_provider_poll_jobs'} as const;
const DELIVERY_LEASE_MS=120_000;
const POLL_DELIVERY_MS=360_000;
export const FEED_DISPATCH_BATCH=100;

/** Dispatch generations are transport bookkeeping, never canonical job/model
 * identity. Strip metadata before strict parsers and canonical journaling. */
export function decodeConnectorDelivery<T>(raw:T):{body:T;token?:string}{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {body:raw};
 const record=raw as T&{type?:unknown;_connectorDispatchToken?:unknown};
 if(typeof record.type!=='string'||!record.type.startsWith('v1_')&&record.type!=='connector_relay'||!Object.hasOwn(record,'_connectorDispatchToken'))return {body:raw};
 const {_connectorDispatchToken,...body}=record;
 return {body:body as unknown as T,...(typeof _connectorDispatchToken==='string'&&_connectorDispatchToken?{token:_connectorDispatchToken}: {})};
}

/** Indexed feed round-robin: expensive collection happens in queue consumers,
 * never inside Cron. One crashed delivery remains discoverable after expiry. */
export async function dispatchConnectorFeeds(env:Env,now=Date.now(),limit=FEED_DISPATCH_BATCH){
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return 0;
 requireConnectorQueues(env);
 if(!env.SOURCE_COLLECTION_QUEUE)throw Error('SOURCE_COLLECTION_QUEUE_REQUIRED');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('INVALID_DISPATCH_LIMIT');
 let sent=0;
 const token=crypto.randomUUID();
 const rows=await env.DB.prepare(`UPDATE connector_feed_schedule SET due_ms=?,token=? WHERE feed_id IN
  (SELECT feed_id FROM connector_feed_schedule WHERE due_ms<=? AND processing_until<=? ORDER BY due_ms,feed_id LIMIT ?) RETURNING feed_id`).bind(now+DELIVERY_LEASE_MS,token,now,now,limit).all<{feed_id:string}>();
 if(!rows.results.length)return 0;
 // Optional control lane prevents long upstream downloads from occupying all
 // consumers needed to enroll/wake other feeds. Polls stay on collection.
 const control=env.SOURCE_SCHEDULING_QUEUE??env.SOURCE_COLLECTION_QUEUE;
 try{await control.sendBatch(rows.results.map(row=>({body:{type:'connector_feed',feedId:row.feed_id,token} as ConnectorQueueMessage})));sent=rows.results.length;}
 catch(error){await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=?,last_error=? WHERE token=?').bind(now+30_000,'QUEUE_SEND_FAILED',token).run();throw error;}
 return sent;
}

/** Existing canonical runners own processing. This proxy only coalesces queue
 * delivery, so the other owner's intelligence runtime needs no modification. */
export function coalescedProcessingQueue(env:Env,at?:number):Queue<DistilledQueueMessage>{
 requireConnectorQueues(env);
 const original=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?env.V1_PROCESSING_QUEUE!:env.V1_PROCESSING_QUEUE??env.PROCESSING_QUEUE;
 const send=async(raw:DistilledQueueMessage,options?:QueueSendOptions)=>{
  const now=at??Date.now();
  const {body}=decodeConnectorDelivery(raw);
  if(!body.type?.startsWith('v1_')&&body.type!=='connector_relay')return env.PROCESSING_QUEUE.send(body,options);
  const id=await sha256(JSON.stringify(body)),token=crypto.randomUUID();
  if(body.type==='v1_briefing'&&!await collectionReadyForWindow(env,body.feedId,body.window.end,id,now))return false as never;
  const claimed=await env.DB.prepare(`INSERT INTO connector_queue_dispatch(kind,id,available_ms,token) VALUES(?,?,?,?)
   ON CONFLICT(kind,id) DO UPDATE SET available_ms=excluded.available_ms,token=excluded.token,sends=sends+1,last_error=NULL WHERE available_ms<=? RETURNING id`).bind(body.type,id,now+DELIVERY_LEASE_MS,token,now).first();
  if(!claimed)return false as never;
  if(!await reserveConnectorWork(env,body,token,now)){
   await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=0 WHERE kind=? AND id=? AND token=?').bind(body.type,id,token).run();
   return false as never;
  }
  const acquisition=env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true'?env.V1_ACQUISITION_QUEUE!:env.V1_ACQUISITION_QUEUE??original;
  const target=body.type==='v1_acquisition'||body.type==='connector_relay'?acquisition:original;
  const transport={...body,_connectorDispatchToken:token};
  try{return await target.send(transport,options)}catch(error){await releaseConnectorWork(env,token);await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=?,last_error=? WHERE kind=? AND id=? AND token=?').bind(now+30_000,'QUEUE_SEND_FAILED',body.type,id,token).run();throw error;}
 };
 // Canonical dispatchers ignore send metadata. A coalesced no-op returns no
 // fabricated queue statistics; native metrics remain directly available.
 return {send,sendBatch:async(batch:Iterable<MessageSendRequest<DistilledQueueMessage>>,options?:QueueSendBatchOptions)=>{let last;for(const item of batch){const {body,...individual}=item;const result=await send(body,{...options,...individual});if(result)last=result;}return last;},metrics:()=>original.metrics()} as unknown as Queue<DistilledQueueMessage>;
}

/** Publication must not silently call an uncollected window "quiet". Later
 * collection windows do not hold this boundary; blocked sources are reported
 * separately as unavailable and remain visible to operators/readers. */
export async function collectionReadyForWindow(env:Env,feedId:string,end:string,id:string,now=Date.now()){
 const {pending}=await pendingWindowCollections(env.DB,feedId,end,env.BRIEFING_ENGINE==='v3');
 if(pending)await env.DB.prepare('INSERT INTO connector_publication_waits(request_id,feed_id,window_end,pending_collections,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET pending_collections=excluded.pending_collections,checked_at=excluded.checked_at WHERE pending_collections<>excluded.pending_collections').bind(id,feedId,end,pending,new Date(now).toISOString()).run();
 else await env.DB.prepare('DELETE FROM connector_publication_waits WHERE request_id=?').bind(id).run();
 return pending===0;
}

async function feedEnv(env:Env,feedId:string):Promise<Env|undefined>{
 const row=await env.DB.prepare(`SELECT (SELECT json_group_array(id) FROM
   (SELECT id FROM sources WHERE briefing_id=b.id AND collection_owner='connector' AND enabled=1 ORDER BY id)) AS source_ids
   FROM briefings b JOIN accounts a ON a.id=b.owner_account_id LEFT JOIN v1_feeds f ON f.id=b.id
   WHERE b.id=? AND b.paused=0 AND a.disabled_at IS NULL
   AND (f.id IS NULL OR json_extract(f.json,'$.ownerId')=b.owner_account_id)`).bind(feedId).first<{source_ids:string}>();
 if(!row)return;
 const ids=JSON.parse(row.source_ids) as string[];if(!ids.length)return;
 return {...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:ids.join(','),PROCESSING_QUEUE:coalescedProcessingQueue(env)};
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
export async function dispatchConnectorPolls(env:Env,feedId:string,now=Date.now(),perKind=1){
 requireConnectorQueues(env);
 if(!env.SOURCE_COLLECTION_QUEUE)throw Error('SOURCE_COLLECTION_QUEUE_REQUIRED');
 if(!Number.isSafeInteger(perKind)||perKind<1||perKind>4)throw Error('INVALID_POLL_DISPATCH_LIMIT');
 const kinds=['rss','provider'] as const,token=crypto.randomUUID();
 const claims=kinds.map(kind=>{
  const table=tables[kind];
  return env.DB.prepare(`UPDATE ${table} SET dispatch_until=?,dispatch_token=? WHERE job_id IN (
   SELECT job_id FROM ${table} WHERE json_extract(request,'$.scope.feedId')=? AND state='PENDING' AND due_at<=?
   AND dispatch_until<=? AND (lease_until IS NULL OR lease_until<=?) ${kind==='provider'?"AND COALESCE(json_extract(request,'$.source.family'),'')<>'telegram'":''} ORDER BY due_at,job_id LIMIT ?) RETURNING job_id`)
   .bind(now+POLL_DELIVERY_MS,token,feedId,new Date(now).toISOString(),now,new Date(now).toISOString(),perKind);
 });
 const results=await env.DB.batch(claims);
 const messages=results.flatMap((rows,index)=>(rows.results as {job_id:string}[]).map(row=>({body:{type:'connector_poll',feedId,jobId:row.job_id,table:kinds[index],token} as ConnectorQueueMessage})));
 if(!messages.length)return 0;
 try{await env.SOURCE_COLLECTION_QUEUE.sendBatch(messages);return messages.length;}
 catch(error){await env.DB.batch(kinds.map(kind=>env.DB.prepare(`UPDATE ${tables[kind]} SET dispatch_until=?,dispatch_token=NULL WHERE dispatch_token=?`).bind(now+30_000,token)));throw error;}
}

/** An already-fetched poll waiting on intake must wake at its persisted retry
 * time, not the next minute-wide Feed scan. Claim a new transport generation;
 * never change its fetch identity, attempts, checkpoint or paid operation. */
export async function continueConnectorIntake(env:Env,feedId:string,jobId:string,kind:'rss'|'provider',now=Date.now()):Promise<boolean>{
 if(!env.SOURCE_COLLECTION_QUEUE)return false;
 const token=crypto.randomUUID(),table=tables[kind];
 const row=await env.DB.prepare(`UPDATE ${table} SET dispatch_until=?,dispatch_token=? WHERE job_id=? AND json_extract(request,'$.scope.feedId')=?
 AND state='PENDING' AND last_error='INTAKE_BUSY' AND dispatch_until<=? AND (lease_until IS NULL OR lease_until<=?) RETURNING due_at`).bind(now+POLL_DELIVERY_MS,token,jobId,feedId,now,new Date(now).toISOString()).first<{due_at:string}>();
 if(!row)return false;
 try{await env.SOURCE_COLLECTION_QUEUE.send({type:'connector_poll',feedId,jobId,table:kind,token},{delaySeconds:Math.min(43200,Math.max(1,Math.ceil((Date.parse(row.due_at)-now)/1000)))});return true;}
 catch(error){await env.DB.prepare(`UPDATE ${table} SET dispatch_until=0,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?`).bind(jobId,token).run();throw error;}
}

/** Coordination interface: feed-scoped environment + existing dispatchers.
 * Canonical intelligence/window policy stays owned by v1-intelligence/runtime. */
export async function relayConnectorDownstream(env:Env,feedId?:string){
 if(feedId)await dispatchReadyConnectorBriefing(env,feedId);
 await dispatchV1Acquisitions(env);
 await dispatchV1Intelligence(env);
}

export async function processConnectorMessage(env:Env,raw:ConnectorQueueMessage,dispatchToken?:string){
 const delivery=decodeConnectorDelivery(raw),body=delivery.body;
 const completionToken=dispatchToken??delivery.token;
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')throw Error('CONNECTOR_SCHEDULER_DISABLED');
 requireConnectorQueues(env);
 if(body.type==='connector_relay'){
  const token=crypto.randomUUID();
  const claim=await env.DB.prepare('UPDATE connector_feed_schedule SET relay_token=?,relay_until=? WHERE feed_id=? AND relay_until<=? RETURNING feed_id').bind(token,Date.now()+DELIVERY_LEASE_MS,body.feedId,Date.now()).first();
  if(!claim)return; // The active delivery owns this relay; expiry remains recoverable.
  let lost=false,renewing:Promise<void>|undefined;
  const timer=setInterval(()=>{if(renewing||lost)return;renewing=(async()=>{try{const r=await env.DB.prepare('UPDATE connector_feed_schedule SET relay_until=? WHERE feed_id=? AND relay_token=? AND relay_until>? RETURNING feed_id').bind(Date.now()+DELIVERY_LEASE_MS,body.feedId,token,Date.now()).first();if(!r)lost=true;}catch{lost=true;}})().finally(()=>{renewing=undefined;});},DELIVERY_LEASE_MS/3);
  try{
   const scoped=await feedEnv(env,body.feedId);if(scoped)await relayConnectorDownstream(scoped,body.feedId);
   if(renewing)await renewing;if(lost)throw new HandoffError('TEMPORARY_UNAVAILABLE');
   await completeConnectorDownstream(env,body,completionToken);
  }finally{clearInterval(timer);if(renewing)await renewing;await env.DB.prepare('UPDATE connector_feed_schedule SET relay_until=0,relay_token=NULL WHERE feed_id=? AND relay_token=?').bind(body.feedId,token).run();}
  return;
 }
 if(body.type==='connector_feed'){
  const workToken=crypto.randomUUID();
  const claimed=await env.DB.prepare('UPDATE connector_feed_schedule SET processing_token=?,processing_until=? WHERE feed_id=? AND token=? AND processing_until<=? RETURNING token,collection_due_ms,collection_epoch').bind(workToken,Date.now()+DELIVERY_LEASE_MS,body.feedId,body.token,Date.now()).first<{token:string;collection_due_ms:number;collection_epoch:number}>();
  if(!claimed)return;
  let released=false;
  try{
   const scoped=await feedEnv(env,body.feedId);
   let nextCollection=claimed.collection_due_ms;
   if(scoped){
    if(claimed.collection_due_ms<=Date.now()){
     const interval=Number(scoped.SOURCE_COLLECTION_INTERVAL_MS??300000);
     if(!Number.isSafeInteger(interval)||interval<60000||interval>86400000)throw Error('INVALID_COLLECTION_INTERVAL');
     await runConnectorMaintenance(scoped,new Date(),{scheduleOnly:true});
     nextCollection=(Math.floor(Date.now()/interval)+1)*interval;
    }
    await dispatchConnectorPolls(scoped,body.feedId);await scoped.PROCESSING_QUEUE.send({type:'connector_relay',feedId:body.feedId});
   }
   await env.DB.batch([env.DB.prepare(`UPDATE connector_feed_schedule SET
    due_ms=CASE WHEN collection_epoch=? THEN ? ELSE 0 END,
    collection_due_ms=CASE WHEN collection_epoch=? THEN ? ELSE collection_due_ms END,
    token=NULL,last_error=NULL,attempts=0 WHERE feed_id=? AND token=? AND processing_token=?`)
    .bind(claimed.collection_epoch,Math.min(Date.now()+(scoped?60_000:300_000),nextCollection||Infinity),claimed.collection_epoch,nextCollection,body.feedId,body.token,workToken),
    env.DB.prepare('UPDATE connector_feed_schedule SET processing_until=0,processing_token=NULL WHERE feed_id=? AND processing_token=?').bind(body.feedId,workToken)]);
   released=true;
  }finally{if(!released)await env.DB.prepare('UPDATE connector_feed_schedule SET processing_until=0,processing_token=NULL WHERE feed_id=? AND processing_token=?').bind(body.feedId,workToken).run();}
 }else{
  if(!Object.hasOwn(tables,body.table))throw Error('INVALID_CONNECTOR_MESSAGE');
  const table=tables[body.table];
  const job=await env.DB.prepare(`SELECT job_id,${body.table==='provider'?"json_extract(request,'$.source.family')":"'rss'"} AS family FROM ${table} WHERE job_id=? AND dispatch_token=? AND json_extract(request,'$.scope.feedId')=?`).bind(body.jobId,body.token,body.feedId).first<{family:string}>();
  if(!job)return;
  let scoped=await feedEnv(env,body.feedId);
  const unpaidOnly=!!scoped&&!!await env.DB.prepare("SELECT 1 FROM connector_queue_recovery WHERE id=? AND kind='UNPAID_POLL_RECOVERY' AND feed_id=?").bind(unpaidPollRecoveryId(body.table,body.jobId),body.feedId).first();
  if(scoped&&unpaidOnly)scoped=unpaidSourceRecoveryEnv(scoped);
  if(!scoped){await env.DB.prepare(`UPDATE ${table} SET state='CANCELLED',dispatch_until=0,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?`).bind(body.jobId,body.token).run();if(job.family==='telegram')await dispatchTelegramLane(env);return;}
  const backend=createConnectorRuntime(scoped,undefined,unpaidOnly?true:undefined);
  // Budget configuration is installed before scheduling, never by a source input.
  const state=await (body.table==='rss'?backend.rssScheduler:backend.scheduler).runOne(300_000,body.jobId);
  const release=env.DB.prepare(`UPDATE ${table} SET dispatch_until=0,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?`).bind(body.jobId,body.token);
  if(state==='LEASE_LOST'){await release.run();throw new HandoffError('TEMPORARY_UNAVAILABLE');}
  // Persist continuation wakeup together with delivery release; relay failures
  // cannot strand a completed page or an eligible pending continuation.
  await env.DB.batch([release,env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=MIN(due_ms,?) WHERE feed_id=? AND token IS NULL').bind(Date.now(),body.feedId)]);
  await continueConnectorIntake(scoped,body.feedId,body.jobId,body.table);
  if(job.family==='telegram')await dispatchTelegramLane(env);
  await scoped.PROCESSING_QUEUE.send({type:'connector_relay',feedId:body.feedId});
  // Finish one page, then yield: other feeds run before this continuation.
 }
}

export async function recordConnectorQueueFailure(env:Env,id:string,body:ConnectorQueueMessage,attempts:number){
 await env.DB.prepare('INSERT INTO connector_queue_recovery(id,kind,feed_id,job_id,attempts,reason,observed_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,observed_at=excluded.observed_at')
 .bind(id,body.type,body.feedId,body.type==='connector_poll'?body.jobId:null,attempts,'QUEUE_DELIVERY_FAILED',new Date().toISOString()).run();
}

/** A capacity wait is not a failed delivery. Rotate only the matching transport
 * generation and send its stable work identity with a short delay, so native
 * retry exhaustion cannot impose the two-minute crash-recovery timeout. */
export async function deferConnectorDownstream(env:Env,body:DistilledQueueMessage,dispatchToken?:string):Promise<boolean>{
 if(!dispatchToken||!body.type?.startsWith('v1_'))return false;
 const row=await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=0 WHERE kind=? AND id=? AND token=? AND available_ms>0 RETURNING id').bind(body.type,await sha256(JSON.stringify(body)),dispatchToken).first();
 if(row){await releaseConnectorWork(env,dispatchToken);await coalescedProcessingQueue(env).send(body,{delaySeconds:1});}
 // A stale delivery has no authority to release or resend a replacement.
 return true;
}

export async function completeConnectorDownstream(env:Env,body:DistilledQueueMessage,dispatchToken?:string){
 if(!body.type?.startsWith('v1_')&&body.type!=='connector_relay'||!dispatchToken)return;
 // A successful old delivery or a legacy tokenless message cannot release a
 // replacement generation. Only the matching delivery can refill its lane.
 const completed=await env.DB.prepare('UPDATE connector_queue_dispatch SET available_ms=0 WHERE kind=? AND id=? AND token=? AND available_ms>0 RETURNING id').bind(body.type,await sha256(JSON.stringify(body)),dispatchToken).first();
 if(!completed)return;
 await releaseConnectorWork(env,dispatchToken);
 let feedId:string|undefined;
 if('jobId' in body){
  const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();feedId=row?.feed_id;
 }else if(body.type==='v1_rematch'){
  // The completed transport is fenced above. Resolve the saved request as well;
  // arbitrary message fields cannot wake or rebind another Feed's work.
  const row=await env.DB.prepare("SELECT feed_id FROM v1_feed_documents WHERE kind='rematch_requests' AND id=? AND feed_id=?").bind(body.requestId,body.feedId).first<{feed_id:string}>();feedId=row?.feed_id;
 }
 if(feedId){
  await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=MIN(due_ms,?) WHERE feed_id=? AND token IS NULL').bind(Date.now(),feedId).run();
  // Completion opens a consumer slot, including a durably rescheduled resource
  // wait. Wake other eligible work; nextRematch still enforces this request's due
  // time. A failed relay send leaves the persisted due wake for Cron recovery.
  if(env.V1_ACQUISITION_QUEUE)await coalescedProcessingQueue(env).send({type:'connector_relay',feedId});
 }
}

/** Delivery bookkeeping is disposable; canonical jobs and financial ledgers
 * remain the durable authority and are never deleted by this cleanup. */
export async function expireConnectorDeliveries(env:Env,now=Date.now()){
 await env.DB.prepare('DELETE FROM connector_feed_turn_waiters WHERE (feed_id,work_id) IN (SELECT feed_id,work_id FROM connector_feed_turn_waiters WHERE expires_at<=? ORDER BY expires_at LIMIT 1000)').bind(now).run();
 await env.DB.prepare('DELETE FROM connector_queue_dispatch WHERE (kind,id) IN (SELECT kind,id FROM connector_queue_dispatch WHERE available_ms<? ORDER BY available_ms LIMIT 1000)').bind(now-86400_000).run();
 await env.DB.prepare("DELETE FROM connector_queue_recovery WHERE id IN (SELECT id FROM connector_queue_recovery WHERE observed_at<? AND kind<>'UNPAID_POLL_RECOVERY' ORDER BY observed_at LIMIT 1000)").bind(new Date(now-30*86400_000).toISOString()).run();
}

/** Operator recovery resumes the immutable job, never allocates a replacement
 * paid operation. Unknown submissions need provider reconciliation first. */
export async function recoverConnectorPoll(env:Env,kind:'rss'|'provider',jobId:string,options?:{unpaidOnly:true;approvalId:string;feedId:string}){
 const table=tables[kind];
 if(!table)throw Error('INVALID_POLL_KIND');
 const row=await env.DB.prepare(`SELECT request,state,last_error,lease_until${kind==='provider'?',provider_order':''} FROM ${table} WHERE job_id=?`).bind(jobId).first<{request:string;state:string;last_error:string|null;lease_until:string|null;provider_order?:string}>();
 if(!row)throw Error('POLL_NOT_FOUND');
 if(row.state==='DONE'||row.state==='CANCELLED')throw Error('POLL_ALREADY_TERMINAL');
 if(row.lease_until&&Date.parse(row.lease_until)>Date.now())throw Error('POLL_LEASE_ACTIVE');
 const request=JSON.parse(row.request);
 if(options){
  if(!['BLOCKED','PENDING'].includes(row.state))throw Error('POLL_NOT_RECOVERABLE');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(options.approvalId)||options.feedId!==request.scope.feedId)throw Error('INVALID_RECOVERY_APPROVAL');
  if(!['rss','website'].includes(request.source?.family??(kind==='rss'?'rss':'')))throw Error('UNPAID_RECOVERY_UNSUPPORTED');
  if(row.last_error==='UNCERTAIN_PAID_SUBMISSION')throw Error('PAID_RECONCILIATION_REQUIRED');
 }
 let readRecovered=false;
 if(row.last_error==='UNCERTAIN_PAID_SUBMISSION'){
  const providerId=request.continuation?.providerId;
  if(kind==='provider'&&['x_apify','google_apify','linkedin_apify'].includes(providerId)){
   const {D1ProviderSourceRepository,sourceSqlFromD1}=await import('@distilled/connectors');
   readRecovered=await new D1ProviderSourceRepository(sourceSqlFromD1(env.DB)).hasReadRecovery(request.scope,await sha256(JSON.stringify([request.scope,request.runId,providerId])),providerId)
    &&!await env.DB.prepare('SELECT 1 FROM connector_provider_operations WHERE feed_id=? AND feed_source_id=? AND payload_ref IS NULL LIMIT 1').bind(request.scope.feedId,request.scope.feedSourceId).first();
  }
  if(!readRecovered&&kind==='provider'){
   // A poll may have stopped before dispatch because a different source had an
   // unattributed legacy hold. Once immutable lineage restores that hold's
   // owner, resume this same poll only if none of its providers remain fenced.
   const providers=JSON.parse(row.provider_order??'[]') as string[];
   const {hasUncertainSourcePayment}=await import('./connector-paid-fence');
   if(providers.length&&!await hasUncertainSourcePayment(env.DB,request.scope.feedId,request.scope.feedSourceId,providers))readRecovered=true;
  }
  if(!readRecovered)throw Error('PAID_RECONCILIATION_REQUIRED');
 }
 const {authorizeConnectorSource}=await import('./connector-runtime');
 if(!await authorizeConnectorSource(env,request))throw Error('SOURCE_NOT_APPROVED');
 if(options)await env.DB.prepare("INSERT INTO connector_queue_recovery(id,kind,feed_id,job_id,attempts,reason,observed_at) VALUES(?,'UNPAID_POLL_RECOVERY',?,?,0,?,?) ON CONFLICT(id) DO NOTHING").bind(unpaidPollRecoveryId(kind,jobId),request.scope.feedId,jobId,options.approvalId,new Date().toISOString()).run();
 const changed=await env.DB.prepare(`UPDATE ${table} SET state='PENDING',due_at=?,dispatch_until=0,dispatch_token=NULL,attempts=0,last_error=NULL WHERE job_id=? AND state IN ('PENDING','BLOCKED') AND (last_error IS NULL OR last_error<>'UNCERTAIN_PAID_SUBMISSION' OR ?=1) AND (lease_until IS NULL OR lease_until<=?) RETURNING job_id`).bind(new Date().toISOString(),jobId,readRecovered?1:0,new Date().toISOString()).first();
 if(!changed)throw Error('POLL_STATE_CHANGED');
 await env.DB.prepare('UPDATE connector_feed_schedule SET due_ms=0 WHERE feed_id=? AND token IS NULL').bind(request.scope.feedId).run();
}
