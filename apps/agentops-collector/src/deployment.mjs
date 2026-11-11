/** SELECT-only deployment-wide health. The partial unresolved-window index and
 * typed active-capacity table avoid loading archived article/history payloads. */
export async function collectDeploymentSnapshot(db,now=Date.now()){
 const at=new Date(now).toISOString(),work={queries:0,rowsRead:0,sqlMs:0};
 const read=async(sql,...args)=>{const r=await db.prepare(sql).bind(...args).all();if(!r.success)throw Error('DEPLOYMENT_READ_FAILED');work.queries++;work.rowsRead+=r.meta?.rows_read??0;work.sqlMs+=r.meta?.timings?.sql_duration_ms??r.meta?.duration??0;return r.results[0]};
 const windows=await read(`SELECT
 COALESCE(SUM(CASE WHEN json_extract(json,'$.state')='PENDING' AND COALESCE(json_extract(json,'$.window.scheduledFor'),json_extract(json,'$.window.end'))<=? THEN 1 ELSE 0 END),0) AS pending,
 COALESCE(MAX(CASE WHEN json_extract(json,'$.state')='PENDING' THEN MAX(0,(julianday(?)-julianday(COALESCE(json_extract(json,'$.window.scheduledFor'),json_extract(json,'$.window.end'))))*86400) ELSE 0 END),0) AS oldest,
 COALESCE(SUM(CASE WHEN json_extract(json,'$.state')='FAILED' THEN 1 ELSE 0 END),0) AS failed
 FROM v1_feed_documents INDEXED BY v1_unresolved_publication_windows
 WHERE kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED')`,at,at);
 const models=await read('SELECT COUNT(*) active,COALESCE(SUM(CASE WHEN lease_until<=? THEN 1 ELSE 0 END),0) expired FROM v1_model_active_operations',now);
 return {values:{observer_up:1,deployment_scope:1,deployment_pending_briefings:windows.pending,deployment_oldest_pending_age_seconds:windows.oldest,deployment_failed_briefings:windows.failed,deployment_active_model_calls:models.active,deployment_expired_model_leases:models.expired,projection_timestamp_seconds:now/1000,snapshot_observed_timestamp_seconds:now/1000},work};
}
