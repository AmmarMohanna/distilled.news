import {makeId} from "@distilled/agent-runtime";
import {D1UpstreamResourceStore} from "./upstream-resource-store";
import {D1SourceHighWaterStore} from "./source-acquisition-store";
import type {Env,PublicAcquisitionRequestMessage} from "./types";
import {isV1ProductSource} from './v1-intelligence/product';

/** Cron uses the same durable request/queue/service as account acquisition. */
export async function enqueueScheduledSourceAcquisitions(env:Pick<Env,"DB"|"WEB_OPERATOR_QUEUE"|"WEB_OPERATOR_RUNTIME_TOKEN"|"V1_DOWNSTREAM_ENABLED"|"V1_DOWNSTREAM_FEED_SOURCE_IDS">,now=new Date()){
  if(!env.WEB_OPERATOR_RUNTIME_TOKEN)return 0;
  const rows=await env.DB.prepare(`SELECT s.id,s.source_url,b.owner_account_id,b.retention_days FROM sources s JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
    WHERE s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL AND s.provider IN ('web','rss') AND s.kind!='google_news'
    AND (s.last_checked_at IS NULL OR s.last_checked_at<?) ORDER BY s.last_checked_at LIMIT 10`)
    .bind(new Date(now.getTime()-5*60000).toISOString()).all<{id:string;source_url:string|null;owner_account_id:string;retention_days:number}>();
  let count=0;
  for(const row of rows.results){
    if(await isV1ProductSource(env,row.id)) continue;
    const sourceUrl=row.source_url;if(!sourceUrl)continue;
    const resource=await new D1UpstreamResourceStore(env.DB).resolveOrCreate({tenantId:row.owner_account_id,canonicalSourceUrl:new URL(sourceUrl).href,now:now.toISOString()});
    const state=await new D1SourceHighWaterStore(env.DB,row.owner_account_id).get(`${row.owner_account_id}:${resource.id}`);
    const floor=new Date(now.getTime()-row.retention_days*86400000).toISOString();
    // Retry unresolved work first; never use lastCheckedAt as a successful boundary.
    const startTime=state?.unresolvedWindow?.startTime??state?.lastSuccessfulBoundary??floor;
    const endTime=state?.unresolvedWindow?.endTime??now.toISOString();
    if(Date.parse(startTime)>=Date.parse(endTime))continue;
    const idempotencyKey=makeId("scheduled_acquisition",row.id,startTime,endTime,String(Math.floor(now.getTime()/300000)));
    const requestId=makeId("public_acquisition_request",row.owner_account_id,new URL(sourceUrl).href,idempotencyKey);
    const payload={ownerAccountId:row.owner_account_id,sourceId:row.id,sourceUrl:new URL(sourceUrl).href,startTime,endTime,idempotencyKey,limits:{maxItems:30,maxPages:5,maxScrolls:5,maxPhysicalAttempts:30,maxExecutionMs:90000}};
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO public_acquisition_requests(request_id,idempotency_key,owner_account_id,request_json,state,created_at)
      SELECT ?,?,?,?,'pending',? WHERE NOT EXISTS(SELECT 1 FROM public_acquisition_requests WHERE json_extract(request_json,'$.sourceId')=? AND state IN ('pending','queued','running'))`)
      .bind(requestId,idempotencyKey,row.owner_account_id,JSON.stringify(payload),now.toISOString(),row.id).run();
    if(Number(inserted.meta.changes)!==1)continue;
    // Mark checked only after durable admission. An unsuccessful send stays pending
    // for the existing cron outbox relay; duplicate delivery is request-claimed.
    await env.DB.prepare("UPDATE sources SET last_checked_at=?,updated_at=? WHERE id=?").bind(now.toISOString(),now.toISOString(),row.id).run();
    await env.WEB_OPERATOR_QUEUE.send({type:"public_acquisition_request",requestId} satisfies PublicAcquisitionRequestMessage);
    await env.DB.prepare("UPDATE public_acquisition_requests SET state='queued' WHERE request_id=? AND state='pending'").bind(requestId).run();
    count++;
  }
  return count;
}
