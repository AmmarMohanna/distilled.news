import type {Env} from '../types';

const WAITING = `kind='briefing_requests' AND json_extract(json,'$.state')='PENDING'
 AND json_extract(json,'$.engine')='v3'`;

/** Keep recoverable paid/prepared work intact. Retire only old unstarted
 * automatic windows of feeds that are still paused in the product database. */
export async function retirePausedUnstartedWindows(db:D1Database,now:Date):Promise<number>{
 const at=now.toISOString(),cutoff=new Date(+now-15*60_000).toISOString();
 const rows=await db.prepare(`UPDATE v1_feed_documents SET json=json_remove(json_set(json,'$.state','DONE',
  '$.result','DEFERRED','$.reason','FEED_PAUSED_WINDOW_RETIRED','$.completedAt',?),'$.nextAttemptAt')
 WHERE kind='briefing_requests' AND id IN (
  SELECT r.id FROM v1_feed_documents r JOIN briefings b ON b.id=r.feed_id JOIN v1_feeds f ON f.id=r.feed_id
  WHERE r.kind='briefing_requests' AND json_extract(r.json,'$.state')='PENDING' AND json_extract(r.json,'$.engine')='v3'
   AND json_extract(r.json,'$.window.end')<? AND b.paused=1 AND json_extract(f.json,'$.paused')=1
   AND json_extract(r.json,'$.window.kind') IN ('30M','HOURLY','DAILY')
   AND julianday(COALESCE(json_extract(r.json,'$.window.scheduledFor'),json_extract(r.json,'$.window.end')))<=julianday(?)
   AND json_extract(r.json,'$.blocked') IS NULL
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=r.feed_id
    AND d.kind IN ('editions','v3_window_results','synthesis_jobs') AND d.id IN (r.id,json_extract(r.json,'$.v3InputId')))
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents i WHERE i.feed_id=r.feed_id AND i.kind='semantic_intents'
    AND json_extract(i.json,'$.input.budgetKey') IN (
     'v3:'||r.id,'editorial:'||json_extract(r.json,'$.window.start')||':'||json_extract(r.json,'$.window.end')))
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents l WHERE l.feed_id=r.feed_id AND l.kind='semantic_work_leases'
    AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents x
      WHERE x.kind='semantic_work_releases' AND x.id=l.id AND json_extract(x.json,'$.token')=json_extract(l.json,'$.token')))
   ORDER BY json_extract(r.json,'$.window.end'),r.feed_id,r.id LIMIT 8
 )
 RETURNING feed_id`).bind(at,cutoff,cutoff,+now).all<{feed_id:string}>();
 return rows.results.length;
}

/** Cron emits one structured warning when publication demand is old and the
 * ledger has no confirmed provider response from a recently admitted call. */
export async function checkBriefingModelStall(db:D1Database,now:Date):Promise<boolean>{
 const cutoff=new Date(+now-15*60_000).toISOString();
 const wait=await db.prepare(`SELECT 1 FROM v1_feed_documents
  WHERE ${WAITING} AND json_extract(json,'$.reason')='PROVIDER_RESOURCE_WAIT'
   AND COALESCE(json_extract(json,'$.providerWaitSince'),json_extract(json,'$.createdAt'))<=?
   AND EXISTS(SELECT 1 FROM briefings b WHERE b.id=v1_feed_documents.feed_id AND b.paused=0 AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=b.owner_account_id AND a.disabled_at IS NULL))
  LIMIT 1`).bind(cutoff).first();
 if(!wait)return false;
 const recent=await db.prepare(`SELECT 1 FROM v1_model_spending_reservations r
  JOIN v1_model_spending_settlements s ON s.id=r.id AND s.token=r.token AND s.reported=1
  WHERE (CASE WHEN r.model LIKE 'cloudflare:%' OR r.model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END)='openrouter'
  AND r.created_at>? LIMIT 1`).bind(cutoff).first();
 if(recent)return false;
 console.warn(JSON.stringify({type:'V1_BRIEFING_MODEL_STALLED',provider:'openrouter',noConfirmedCallMinutes:15}));
 return true;
}

export async function runModelPublicationMaintenance(env:Env,now=new Date()):Promise<void>{
 if(env.V1_DOWNSTREAM_ENABLED!=='true'||env.BRIEFING_ENGINE!=='v3'||env.PRODUCT_FEEDS_ENABLED!=='true')return;
 if(env.V1_MODEL_UNCERTAIN_EXECUTION_POLICY==='isolate-after-5m-v1')try{
  await retirePausedUnstartedWindows(env.DB,now);
 }catch{console.warn(JSON.stringify({type:'V1_PAUSED_WINDOW_MAINTENANCE_FAILED'}))}
 if(now.getUTCMinutes()%5===0)try{
  await checkBriefingModelStall(env.DB,now);
 }catch{console.warn(JSON.stringify({type:'V1_BRIEFING_MODEL_STALL_CHECK_FAILED'}))}
}
