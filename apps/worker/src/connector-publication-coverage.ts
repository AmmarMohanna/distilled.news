/** One read-only definition of the collection gate, shared by dispatch and UI.
 * Terminal failures and polls started after this boundary do not hold it open. */
export async function pendingWindowCollections(db:D1Database,feedId:string,end:string){
 const rows=await db.prepare(`SELECT s.id,s.title,COUNT(*) AS n FROM (
 SELECT request,scheduled_at,last_error,result,'rss' AS family FROM connector_rss_poll_jobs WHERE state='PENDING'
 UNION ALL SELECT request,scheduled_at,last_error,result,'provider' AS family FROM connector_provider_poll_jobs WHERE state='PENDING'
 ) j JOIN sources s ON s.id=json_extract(j.request,'$.scope.feedSourceId')
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
 GROUP BY s.id,s.title ORDER BY s.id`).bind(feedId,feedId,end,end).all<{id:string;title:string;n:number}>();
 return {pending:rows.results.reduce((n,row)=>n+row.n,0),sources:rows.results.map(row=>row.title)};
}
