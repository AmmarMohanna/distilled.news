/** One read-only definition of the collection gate, shared by dispatch and UI.
 * Terminal failures and polls started after this boundary do not hold it open. */
export async function pendingWindowCollections(db:D1Database,feedId:string,end:string,v3=false){
 const rows=await db.prepare(`WITH polls AS (
 SELECT request,scheduled_at,last_error,result,'rss' AS family FROM connector_rss_poll_jobs WHERE state='PENDING'
 UNION ALL SELECT request,scheduled_at,last_error,result,'provider' AS family FROM connector_provider_poll_jobs WHERE state='PENDING'
 ), classified AS (
 SELECT *,CASE WHEN ?=1 AND family='provider'
 AND json_extract(request,'$.source.family')='telegram' AND json_extract(request,'$.requestedBounds')='{}'
 AND json_extract(result,'$.state')='HANDED_OFF' AND json_extract(result,'$.checkpoint') IN ('UNCHANGED','ADVANCED')
 AND json_extract(result,'$.response.durable')=1
 AND julianday(json_extract(result,'$.request.coverage.createdAt'))>=julianday(?)
 AND json_type(result,'$.request.observations')='array' AND json_type(result,'$.response.receipts')='array'
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(result,'$.request.observations')) o
 WHERE COALESCE(julianday(json_extract(o.value,'$.observedAt')),-1)<julianday(?)
 OR NOT EXISTS(SELECT 1 FROM json_each(json_extract(result,'$.response.receipts')) r
 WHERE json_extract(r.value,'$.observationId')=json_extract(o.value,'$.id') AND json_extract(r.value,'$.checkpointResolution')='RESOLVED'))
 AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(result,'$.response.receipts')) r
 WHERE COALESCE(json_extract(r.value,'$.checkpointResolution'),'')<>'RESOLVED')
 THEN 1 ELSE 0 END AS later FROM polls
 ) SELECT s.id,s.title,SUM(1-j.later) AS n,SUM(j.later) AS continuing FROM classified j JOIN sources s ON s.id=json_extract(j.request,'$.scope.feedSourceId')
 WHERE json_extract(j.request,'$.scope.feedId')=? AND s.briefing_id=? AND s.enabled=1 AND s.collection_owner='connector'
 AND (j.scheduled_at='' OR j.scheduled_at<?)
 -- A durably handed-off HTTP 429 already reports failed collection coverage.
 -- Keep its retry scheduled, but do not wait hours for an origin to recover
 -- before downstream can assess this window's available evidence. Unresolved
 -- handoffs and captured pages remain blocking.
 AND NOT(j.family='rss' AND COALESCE(j.last_error,'')='RATE_LIMIT'
 AND COALESCE(json_extract(j.result,'$.checkpoint'),'')='UNCHANGED'
 AND COALESCE(json_extract(j.result,'$.coverage.failureReason'),'')='RATE_LIMIT')
 -- Legacy unbounded X jobs can span many closed windows. A saved later
 -- page is still drained, but cannot enlarge the observed-before boundary
 -- used by this request's acquisition/review and publication admission.
 AND NOT(j.family='provider' AND COALESCE(json_extract(j.request,'$.source.family'),'') IN ('x_profile','x_search')
 AND COALESCE(json_extract(j.request,'$.requestedBounds'),'')='{}'
 AND COALESCE(julianday(json_extract(j.result,'$.request.coverage.createdAt')),0)>=julianday(?))
 GROUP BY s.id,s.title ORDER BY s.id`).bind(v3?1:0,end,end,feedId,feedId,end,end).all<{id:string;title:string;n:number;continuing:number}>();
 // Later pages keep collecting normally. They no longer extend the old turn,
 // but V3 must retain incomplete coverage rather than claiming a quiet window.
 return {pending:rows.results.reduce((n,row)=>n+row.n,0),sources:rows.results.filter(row=>row.n>0).map(row=>row.title),continuing:rows.results.reduce((n,row)=>n+row.continuing,0),continuingSources:rows.results.filter(row=>row.continuing>0).map(row=>row.title)};
}
