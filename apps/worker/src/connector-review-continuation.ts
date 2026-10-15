import type {Env} from './types';
import {enqueueV1,pendingV1Jobs} from './v1-queue-dispatch';

/** Continue durable review after the prior Feed turn has released. Cron remains
 * crash recovery; this sends at most one successor and never performs model work.
 * Transport claims, source authorization and canonical leases remain authoritative. */
export async function continueFeedReview(env:Env,completedJobId:string,now=new Date()):Promise<boolean>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return false;
 const job=await env.DB.prepare("SELECT s.feed_id,j.feed_source_id FROM v1_jobs j JOIN v1_intake_scopes s ON s.id=j.feed_source_id WHERE j.id=? AND json_extract(j.json,'$.kind')='REASSESS' AND json_extract(j.json,'$.state')='DONE'").bind(completedJobId).first<{feed_id:string;feed_source_id:string}>();
 if(!job)return false;
 const allowed=new Set((env.V1_DOWNSTREAM_FEED_SOURCE_IDS??'').split(',').map(s=>s.trim()).filter(Boolean));
 const sources=await env.DB.prepare("SELECT s.id FROM v1_intake_scopes s WHERE s.feed_id=? AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL ORDER BY CASE WHEN s.id>? THEN 0 ELSE 1 END,s.id").bind(job.feed_id,job.feed_source_id).all<{id:string}>();
 for(const source of sources.results){
  if(!allowed.has(source.id))continue;
  for(const next of await pendingV1Jobs(env,source.id,'REASSESS',now)){
   if(await enqueueV1(env,'v1_reassess',next.id,{type:'v1_reassess',jobId:next.id},now))return true;
  }
 }
 return false;
}

