import type {Env} from './types';
import {enqueueV1} from './v1-queue-dispatch';
import {jobsHoldingWindow,isAutomaticReportingWindow} from './v1-intelligence/runtime';
import {publicationWindowSchema} from './v1-intelligence/schedule';
import {createStoredEvidenceModel} from './v1-intelligence/model';
import {pendingWindowCollections} from './connector-publication-coverage';
/** Give ready closed windows a transport turn before new
 * reviews refill the single intelligence lane. Canonical publication still
 * rechecks all evidence, approvals, model accounting, grounding and leases. */
export async function dispatchReadyConnectorBriefing(env:Env,feedId:string,now=new Date()):Promise<boolean>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||env.V1_DOWNSTREAM_ENABLED!=='true')return false;
 const row=await env.DB.prepare(`SELECT r.id,r.json FROM v1_feed_documents r JOIN briefings b ON b.id=r.feed_id JOIN accounts a ON a.id=b.owner_account_id
 WHERE r.feed_id=? AND r.kind='briefing_requests' AND b.paused=0 AND a.disabled_at IS NULL AND json_extract(r.json,'$.state')='PENDING'
 AND COALESCE(json_extract(r.json,'$.reason'),'')<>'MODEL_SETUP_REQUIRED'
 AND julianday(json_extract(r.json,'$.window.end'))<=julianday(?) AND julianday(b.created_at)<julianday(json_extract(r.json,'$.window.end'))
 AND (json_extract(r.json,'$.nextAttemptAt') IS NULL OR julianday(json_extract(r.json,'$.nextAttemptAt'))<=julianday(?))
 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents j WHERE j.feed_id=r.feed_id AND j.kind='synthesis_jobs' AND j.id=r.id)
 AND NOT EXISTS(SELECT 1 FROM v1_queue_dispatches d WHERE d.kind='v1_briefing' AND d.id=r.id AND (d.lease_until>? OR d.not_before>?))
 ORDER BY json_extract(r.json,'$.window.end'),r.id LIMIT 1`).bind(feedId,now.toISOString(),now.toISOString(),now.getTime(),now.getTime()).first<{id:string;json:string}>();
 if(!row)return false;
 const request=JSON.parse(row.json),window=publicationWindowSchema.safeParse(request.window);if(!window.success)return false;
 if(!isAutomaticReportingWindow(window.data))return false;
 if((request.requireModel||env.V1_REAL_MODEL_REQUIRED==='true')&&!createStoredEvidenceModel(env))return false;
 if(await jobsHoldingWindow(env.DB,feedId,window.data.end)||(await pendingWindowCollections(env.DB,feedId,window.data.end)).pending)return false;
 return enqueueV1(env,'v1_briefing',row.id,{type:'v1_briefing',feedId,window:window.data},now);
}
