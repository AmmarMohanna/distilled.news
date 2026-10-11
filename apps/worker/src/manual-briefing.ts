import {HandoffError,sha256} from '@distilled/contracts';
import type {BriefingConfig} from '@distilled/core';
import type {Env} from './types';
import {productRuntimeEnv} from './product-feeds';
import {runConnectorMaintenance} from './connector-runtime';
import {enrollV1Source} from './v1-intelligence/product';
import {V1FeedStore,feedTransact} from './v1-intelligence/store';
import {windowIdentity,dispatchV1Intelligence} from './v1-intelligence/runtime';
import {dispatchV1Acquisitions} from './v1-downstream-runtime';
import type {PublicationWindow} from './v1-intelligence/scoring';

export interface ManualBriefingRequest {
 id:string;feedId:string;sourceIds:string[];createdAt:string;state:'PENDING'|'DONE'|'FAILED';
 phase:'COLLECTION'|'PROCESSING';scheduled?:{id:string;scheduler:string;sourceId:string}[];
 window?:PublicationWindow;briefingRequestId?:string;result?:string;reason?:string;
}
/** Owner admission is performed at the HTTP boundary. Durable identity limits
 * repeated clicks to one run per ten-minute bucket; an active run is reused. */
export async function requestManualBriefing(env:Env,feed:BriefingConfig,now=new Date()):Promise<ManualBriefingRequest> {
 if(env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')throw new HandoffError('TEMPORARY_UNAVAILABLE');
 const rows=await env.DB.prepare("SELECT id FROM sources WHERE briefing_id=? AND enabled=1 AND collection_owner='connector' ORDER BY id").bind(feed.id).all<{id:string}>();
 if(!rows.results.length)throw new HandoffError('INVALID_REQUEST');
 for(const source of rows.results)await enrollV1Source(env.DB,source.id,feed.ownerAccountId,now.toISOString());
 const id=await sha256(JSON.stringify(['manual-briefing',feed.id,Math.floor(now.getTime()/600000)])),store=new V1FeedStore(env.DB);
 const request=await feedTransact(store,feed.id,async tx=>{
  const active=(await tx.list<ManualBriefingRequest>('manual_briefing_requests')).find(r=>r.state==='PENDING');
  if(active)return active;
  const previous=await tx.read<ManualBriefingRequest>('manual_briefing_requests',id);if(previous)return previous;
  const value:ManualBriefingRequest={id,feedId:feed.id,sourceIds:rows.results.map(r=>r.id),createdAt:now.toISOString(),state:'PENDING',phase:'COLLECTION'};
  await tx.write('manual_briefing_requests',id,value);return value;
 });
 if(request.state==='PENDING')await env.PROCESSING_QUEUE.send({type:'v1_manual_briefing',feedId:feed.id,requestId:request.id});
 return request;
}
/** Schedule frozen manual windows without draining with a partial allowlist:
 * the global runner must keep every owner's approved jobs authorized. */
export async function prepareManualBriefing(env:Env,feedId:string,id:string):Promise<void> {
 env=await productRuntimeEnv(env);const store=new V1FeedStore(env.DB),request=await store.read<ManualBriefingRequest>(feedId,'manual_briefing_requests',id);
 if(!request||request.state!=='PENDING'||request.scheduled)return;
 const current=await env.DB.prepare(`SELECT b.paused,a.disabled_at FROM briefings b JOIN accounts a ON a.id=b.owner_account_id WHERE b.id=?`).bind(feedId).first<{paused:number;disabled_at:string|null}>();
 if(!current||current.paused||current.disabled_at)return;
 const approved=new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(','));
 const scoped={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:request.sourceIds.filter(id=>approved.has(id)).join(',')};
 const result=await runConnectorMaintenance(scoped,new Date(request.createdAt),{manualRunId:request.id,scheduleOnly:true});
 if(!result)throw new HandoffError('TEMPORARY_UNAVAILABLE');
 await feedTransact(store,feedId,async tx=>{
  const current=await tx.read<ManualBriefingRequest>('manual_briefing_requests',id);if(!current||current.state!=='PENDING'||current.scheduled)return;
  await tx.write('manual_briefing_requests',id,{...current,scheduled:result.scheduled});
 });
}
/** Cron retries the durable outbox after queue loss. Publication gets one closed
 * window only after collection terminates, so newly observed posts are included.
 * Ordinary intelligence dispatch then waits for acquisition/reassessment jobs. */
export async function relayManualBriefings(env:Env,now=new Date()):Promise<number> {
 if(env.PRODUCT_FEEDS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return 0;
 const rows=await env.DB.prepare("SELECT feed_id,id FROM v1_feed_documents WHERE kind='manual_briefing_requests' AND json_extract(json,'$.state')='PENDING' ORDER BY json_extract(json,'$.createdAt'),id LIMIT 10").all<{feed_id:string;id:string}>();
 let sent=0;const store=new V1FeedStore(env.DB);
 for(const row of rows.results){
  const product=await env.DB.prepare('SELECT b.paused,a.disabled_at FROM briefings b JOIN accounts a ON a.id=b.owner_account_id WHERE b.id=?').bind(row.feed_id).first<{paused:number;disabled_at:string|null}>();
  if(!product||product.paused||product.disabled_at)continue;
  const request=await store.read<ManualBriefingRequest>(row.feed_id,'manual_briefing_requests',row.id);if(!request||request.state!=='PENDING')continue;
  if(!request.scheduled){await env.PROCESSING_QUEUE.send({type:'v1_manual_briefing',feedId:row.feed_id,requestId:row.id});sent++;continue;}
  if(request.phase==='COLLECTION'){
   const ids=JSON.stringify(request.scheduled.map(j=>j.id));
   const jobs=await env.DB.prepare("SELECT job_id,state FROM connector_rss_poll_jobs WHERE job_id IN (SELECT value FROM json_each(?)) UNION ALL SELECT job_id,state FROM connector_provider_poll_jobs WHERE job_id IN (SELECT value FROM json_each(?))").bind(ids,ids).all<{job_id:string;state:string}>();
   if(jobs.results.length!==request.scheduled.length||jobs.results.some(j=>j.state==='PENDING'))continue;
   await feedTransact(store,row.feed_id,async tx=>{
    const current=await tx.read<ManualBriefingRequest>('manual_briefing_requests',row.id);if(!current||current.state!=='PENDING'||current.phase!=='COLLECTION')return;
    if(!jobs.results.some(j=>j.state==='DONE')){await tx.write('manual_briefing_requests',row.id,{...current,state:'FAILED',reason:'SOURCE_COLLECTION_FAILED'});return;}
    const feed=tx.snapshot.feed,duration=Math.min(7*86400000,(feed.briefingSchedule?.durationMinutes??(feed.briefingFrequency==='30M'?30:feed.briefingFrequency==='HOURLY'?60:1440))*60000);
    const window:PublicationWindow={start:new Date(Math.max(Date.parse(current.createdAt)-duration,now.getTime()-7*86400000)).toISOString(),end:now.toISOString(),kind:feed.briefingFrequency};
    const briefingRequestId=await windowIdentity(row.feed_id,window);
    await tx.write('briefing_requests',briefingRequestId,{id:briefingRequestId,feedId:row.feed_id,window,state:'PENDING',attempts:0,createdAt:current.createdAt,...(env.V1_REAL_MODEL_REQUIRED==='true'?{requireModel:true}:{})});
    await tx.write('manual_briefing_requests',row.id,{...current,phase:'PROCESSING',window,briefingRequestId});
   });
  }else if(request.briefingRequestId){
   const publication=await store.read<{state:string;result?:string;failure?:string}>(row.feed_id,'briefing_requests',request.briefingRequestId);
   if(publication&&['DONE','FAILED'].includes(publication.state))await feedTransact(store,row.feed_id,async tx=>{
    const current=await tx.read<ManualBriefingRequest>('manual_briefing_requests',row.id);if(current?.state==='PENDING')await tx.write('manual_briefing_requests',row.id,{...current,state:publication.state as 'DONE'|'FAILED',result:publication.result,reason:publication.failure});
   });
  }
 }
 return sent;
}

/** A manual click drives its bounded work through Queue continuations, without
 * depending on a new Cron trigger propagating. Polling identities and provider
 * leases retain paid-call replay protection across duplicate deliveries. */
export async function driveManualBriefing(env:Env,feedId:string,id:string):Promise<boolean> {
 env=await productRuntimeEnv(env);
 const product=await env.DB.prepare('SELECT b.paused,a.disabled_at FROM briefings b JOIN accounts a ON a.id=b.owner_account_id WHERE b.id=?').bind(feedId).first<{paused:number;disabled_at:string|null}>();
 if(!product||product.paused||product.disabled_at)return false;
 const store=new V1FeedStore(env.DB);
 let request=await store.read<ManualBriefingRequest>(feedId,'manual_briefing_requests',id);
 if(!request||request.state!=='PENDING')return false;
 await prepareManualBriefing(env,feedId,id);
 await relayManualBriefings(env);
 request=await store.read<ManualBriefingRequest>(feedId,'manual_briefing_requests',id);
 if(request?.state!=='PENDING')return false;
 // Keep the complete authorization set while draining collection: a partial
 // allowlist would cancel another feed's previously admitted source jobs.
 if(request.phase==='COLLECTION')await runConnectorMaintenance(env,new Date(),{skipSchedule:true});
 await relayManualBriefings(env);
 const scoped={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:(env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').filter(sourceId=>sourceId.startsWith(feedId+'::')).join(',')};
 await dispatchV1Acquisitions(scoped);
 await dispatchV1Intelligence(scoped);
 await relayManualBriefings(env);
 const current=await store.read<ManualBriefingRequest>(feedId,'manual_briefing_requests',id);
 if(current?.state!=='PENDING')return false;
 if(current.briefingRequestId){
  const publication=await store.read<{reason?:string}>(feedId,'briefing_requests',current.briefingRequestId);
  if(publication?.reason==='MODEL_SETUP_REQUIRED')return false;
 }
 return true;
}
