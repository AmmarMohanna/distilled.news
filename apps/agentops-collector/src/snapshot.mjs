import {projectSnapshots} from '../../../ops/observability/snapshot-projector.mjs';

export const SQL = {
  feed: "SELECT json_extract(json,'$.briefingSchedule') AS schedule FROM v1_feeds WHERE id=?",
  request: `SELECT id,json_object('id',id,'state',json_extract(json,'$.state'),'result',json_extract(json,'$.result'),'failure',json_extract(json,'$.failure'),'reason',json_extract(json,'$.reason'),'blocked',json_extract(json,'$.blocked'),'coverage',json_extract(json,'$.coverage'),'window',json_extract(json,'$.window'),'scheduledFor',json_extract(json,'$.scheduledFor'),'v3InputId',json_extract(json,'$.v3InputId')) AS metadata FROM v1_feed_documents INDEXED BY v1_clock_schedule_requests WHERE feed_id=? AND kind='briefing_requests' AND json_extract(json,'$.window.clockStartAt') IS ? AND json_extract(json,'$.window.durationMinutes') IS ? ORDER BY json_extract(json,'$.window.end') DESC LIMIT 1`,
  run: "SELECT json_extract(json,'$.result.timings') AS timings FROM v1_feed_documents WHERE kind='v3_window_results' AND id=? AND feed_id=?",
  edition: "SELECT json_extract(e.json,'$.scheduledFor') AS scheduledFor,coalesce(json_extract(s.json,'$.publishedAt'),json_extract(e.json,'$.publishedAt'),json_extract(e.json,'$.createdAt')) AS recordedPublishedAt FROM v1_feed_documents e LEFT JOIN v1_feed_documents s ON s.kind='publication_status' AND s.id=e.id AND s.feed_id=e.feed_id WHERE e.kind='editions' AND e.id=? AND e.feed_id=?",
  sources: 'SELECT id FROM v1_intake_scopes INDEXED BY connector_intake_feed WHERE feed_id=? ORDER BY id LIMIT 5',
  jobs: "SELECT json_extract(json,'$.kind') AS kind,json_extract(json,'$.state') AS state,json_extract(json,'$.enqueuedAt') AS enqueuedAt FROM v1_jobs INDEXED BY v1_jobs_due WHERE feed_source_id=? AND json_extract(json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(json,'$.state') IN ('PENDING','RUNNING') LIMIT 101",
  operations: `SELECT i.id,json_extract(i.json,'$.reservedCostUsd') AS reserved,json_extract(i.json,'$.input.state.repair.originalOperationId') AS parent,json_extract(r.json,'$.usage') AS usage,json_extract(t.json,'$.usage') AS settlementUsage,json_extract(r.json,'$.latencyMs') AS latencyMs,json_extract(r.json,'$.failure') AS failure,json_extract(r.json,'$.providerDiagnostic.execution') AS execution,json_extract(r.json,'$.providerDiagnostic.reportedCostUsd') AS rejectedCost,m.reserved_cost_usd AS moneyReserved,s.cost_usd AS cost,s.reported FROM v1_feed_documents i INDEXED BY v1_semantic_intent_budget LEFT JOIN v1_feed_documents r ON r.kind='semantic_results' AND r.id=i.id AND r.feed_id=i.feed_id LEFT JOIN v1_feed_documents t ON t.kind='semantic_settlements' AND t.id=i.id AND t.feed_id=i.feed_id LEFT JOIN v1_model_spending_reservations m ON m.id='semantic_intents:'||i.id AND m.feed_id=i.feed_id LEFT JOIN v1_model_spending_settlements s ON s.id=m.id WHERE i.kind='semantic_intents' AND i.feed_id=? AND json_extract(i.json,'$.input.budgetKey')=? LIMIT 25`,
};
const parsed=v=>typeof v==='string'?JSON.parse(v):v;
/** One explicit feed, latest persisted policy window; no historical API scans,
 * source text, ledger writes, queue sends, provider calls or local files. */
export async function collectSnapshot(db, feedId, now) {
  if(typeof feedId!=='string'||!feedId||feedId.length>150||!Number.isSafeInteger(now))throw Error('EXPLICIT_FEED_REQUIRED');
  const work={queries:0,rowsRead:0,sqlMs:0};const started=performance.now();let timingKnown=true;
  const read=async(sql,...params)=>{
    if(performance.now()-started>10000)throw Error('COLLECTION_DEADLINE');
    if(++work.queries>10)throw Error('QUERY_BUDGET');
    const r=await db.prepare(sql).bind(...params).all();
    if(!r.success||!Number.isSafeInteger(r.meta?.rows_read)||r.meta.rows_read<0)throw Error('READ_METRICS_UNAVAILABLE');
    work.rowsRead+=r.meta.rows_read;const timing=r.meta.timings?.sql_duration_ms??r.meta.duration;
    if(typeof timing!=='number'||!Number.isFinite(timing)||timing<0)timingKnown=false;
    work.sqlMs=timingKnown?work.sqlMs+timing:null;
    if(work.rowsRead>2000)throw Error('ROW_READ_BUDGET');
    return r.results;
  };
  const feed=await read(SQL.feed,feedId);if(feed.length!==1)throw Error('FEED_NOT_FOUND');
  const schedule=parsed(feed[0].schedule)||{};
  const rows=await read(SQL.request,feedId,schedule.clockStartAt??null,schedule.durationMinutes??null);
  if(!rows.length)throw Error('NO_RECORDED_WINDOW');
  const request=parsed(rows[0].metadata),window={start:request.window?.start,end:request.window?.end};
  const at=new Date(now).toISOString();
  const page=(view,items,summary)=>({schemaVersion:'pipeline-trace-v1',observedAt:at,feed:{id:feedId},window,view,items,summary,page:{total:items.length,nextCursor:null}});
  const run=(await read(SQL.run,request.v3InputId??request.id,feedId))[0];
  const editions=await read(SQL.edition,request.id,feedId);
  const pages=[page('overview',[],{publication:{briefingRequest:request,recordedEditions:editions},v3Run:run?{timings:parsed(run.timings)}:undefined})];
  const operations=await read(SQL.operations,feedId,'v3:'+request.id);
  if(operations.length>24)throw Error('OPERATION_COHORT_LIMIT');
  pages.push(page('operations',operations.map(o=>{
    const settlement=parsed(o.settlementUsage),usage=settlement?.reported?settlement:parsed(o.usage);
    const accounted=o.moneyReserved!=null,known=accounted?o.reported===1:usage?.reported===true;
    return {id:o.id,recordKind:'semantic_intents',accountSettlementState:accounted?(o.reported===1?'SETTLED':'UNSETTLED'):'NOT_OBSERVABLE',reportedCostUsd:known?(accounted?o.cost:usage.costUsd):null,providerReportedCostUsd:usage?.calls===0?null:o.execution==='REJECTED_BEFORE_EXECUTION'?(o.rejectedCost??null):usage?.reported?usage.costUsd:null,reservedExposureUsd:o.moneyReserved??o.reserved??0,heldExposureUsd:known?0:Math.max(o.moneyReserved??o.reserved??0,usage?.costUsd??0),calls:usage?.calls??null,tokensIn:usage?.tokensIn??null,tokensOut:usage?.tokensOut??null,latencyMs:o.latencyMs,failure:o.failure,repairOperationIds:operations.filter(r=>r.parent===o.id).map(r=>r.id)};
  })));
  const sources=await read(SQL.sources,feedId);if(sources.length>4)throw Error('SOURCE_COHORT_LIMIT');
  const items=[];
  for(const source of sources){
    const jobs=await read(SQL.jobs,source.id);if(jobs.length>100)throw Error('JOB_COHORT_LIMIT');
    const groups=new Map();for(const j of jobs){const key=j.kind+':'+j.state;const g=groups.get(key)??{kind:j.kind,state:j.state,count:0,timestampedJobs:0};g.count++;if(j.enqueuedAt){g.timestampedJobs++;if(!g.oldestEnqueuedAt||j.enqueuedAt<g.oldestEnqueuedAt)g.oldestEnqueuedAt=j.enqueuedAt;}groups.set(key,g);}
    // Completed/failed jobs, total historical attempts and provider health were
    // not read: omit those measurements rather than inventing healthy zeros.
    items.push({id:source.id,collection:{observedAt:at,jobCounts:[...groups.values()]}});
  }
  if(items.length)pages.push(page('sources',items));
  const snapshot=projectSnapshots(pages);
  // Exact active-work zeros are known only after a complete bounded source read.
  if(items.length)for(const kind of ['acquire','reassess'])for(const state of ['pending','running'])snapshot.values['jobs_'+kind+'_'+state]??=0;
  snapshot.values.observer_up=1;
  snapshot.values.snapshot_observed_timestamp_seconds=now/1000;
  snapshot.values.projection_timestamp_seconds=now/1000;
  return {values:snapshot.values,work};
}
