import type {Env} from '../types';

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

export async function runModelPublicationMaintenance(env:Env,now=new Date()):Promise<void>{
 if(env.V1_DOWNSTREAM_ENABLED!=='true'||env.BRIEFING_ENGINE!=='v3'||env.PRODUCT_FEEDS_ENABLED!=='true')return;
 if(env.V1_MODEL_UNCERTAIN_EXECUTION_POLICY==='isolate-after-5m-v1')try{
  await retirePausedUnstartedWindows(env.DB,now);
 }catch{console.warn(JSON.stringify({type:'V1_PAUSED_WINDOW_MAINTENANCE_FAILED'}))}
}
