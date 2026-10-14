import type {Env} from './types';
import {requireConnectorQueues} from './connector-queue-config';
import type {ConnectorQueueMessage} from './connector-scheduling';

/** One queued or executing session operation. Feed turns are durable, and the
 * oldest eligible job inside the least recently served feed wins. No source
 * state, checkpoint or paid operation is rewritten by this dispatcher. */
export async function dispatchTelegramLane(env:Env,now=Date.now()):Promise<number>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||env.SOURCE_CONNECTORS_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return 0;
 requireConnectorQueues(env);
 if(!env.SOURCE_COLLECTION_QUEUE)throw Error('SOURCE_COLLECTION_QUEUE_REQUIRED');
 const token=crypto.randomUUID(),at=new Date(now).toISOString();
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE connector_provider_poll_jobs SET dispatch_until=?,dispatch_token=? WHERE job_id=(
   SELECT j.job_id FROM connector_provider_poll_jobs j
   WHERE j.state='PENDING' AND json_extract(j.request,'$.source.family')='telegram'
   AND json_extract(j.request,'$.scope.feedId')=(SELECT f.feed_id FROM connector_feed_schedule f
    WHERE f.telegram_due_ms<=? AND EXISTS(SELECT 1 FROM connector_provider_poll_jobs eligible
     WHERE eligible.state='PENDING' AND json_extract(eligible.request,'$.source.family')='telegram'
     AND json_extract(eligible.request,'$.scope.feedId')=f.feed_id AND eligible.due_at<=?
     AND eligible.dispatch_until<=? AND (eligible.lease_until IS NULL OR eligible.lease_until<=?))
    ORDER BY f.telegram_dispatched_ms,f.feed_id LIMIT 1)
   AND j.due_at<=? AND j.dispatch_until<=? AND (j.lease_until IS NULL OR j.lease_until<=?)
   AND NOT EXISTS(SELECT 1 FROM connector_provider_poll_jobs busy WHERE busy.state='PENDING'
    AND json_extract(busy.request,'$.source.family')='telegram' AND busy.dispatch_until>?)
   AND NOT EXISTS(SELECT 1 FROM connector_provider_poll_jobs busy WHERE busy.state='PENDING'
    AND json_extract(busy.request,'$.source.family')='telegram' AND busy.lease_until>?)
   ORDER BY j.due_at,j.job_id LIMIT 1)
   RETURNING job_id,json_extract(request,'$.scope.feedId') AS feed_id`)
   .bind(now+360_000,token,now,at,now,at,at,now,at,now,at),
  env.DB.prepare(`UPDATE connector_feed_schedule SET telegram_dispatched_ms=? WHERE feed_id=(
   SELECT json_extract(request,'$.scope.feedId') FROM connector_provider_poll_jobs WHERE dispatch_token=? LIMIT 1)`).bind(now,token)
 ]);
 const row=results[0].results[0] as {job_id:string;feed_id:string}|undefined;
 if(!row)return 0;
 const body:ConnectorQueueMessage={type:'connector_poll',table:'provider',feedId:row.feed_id,jobId:row.job_id,token};
 try{await env.SOURCE_COLLECTION_QUEUE.sendBatch([{body}]);return 1;}
 catch(error){await env.DB.prepare('UPDATE connector_provider_poll_jobs SET dispatch_until=?,dispatch_token=NULL WHERE job_id=? AND dispatch_token=?').bind(now+30_000,row.job_id,token).run();throw error;}
}
