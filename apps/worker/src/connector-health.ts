/** Read-only connector diagnostics. Do not expose raw provider responses or
 * operation identifiers: they can contain source data and paid credentials. */
export async function connectorSourceHealth(db:D1Database,feedId:string,sourceId:string,now=new Date()){
 const [run,providerBatch,rssBatch,providerSuccess,rssSuccess,providerCounts,rssCounts,providerCursor,rssCheckpoint,providerJob,rssJob,nextProviderJob,nextRssJob,failures,latestFailure]=await Promise.all([
  db.prepare('SELECT started_at AS startedAt,sequence FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=? ORDER BY sequence DESC LIMIT 1').bind(feedId,sourceId).first<{startedAt:string;sequence:number}>(),
  db.prepare(`SELECT json_extract(data,'$.providerId') AS provider,
    json_extract(data,'$.request.coverage.status') AS coverage,
    json_array_length(json_extract(data,'$.request.observations')) AS observations,
    json_array_length(json_extract(data,'$.request.proposals')) AS proposals,
    json_extract(data,'$.request.coverage.createdAt') AS checkedAt,
    receipts IS NOT NULL AS accepted
    FROM connector_provider_batches WHERE feed_id=? AND feed_source_id=?
    ORDER BY json_extract(data,'$.request.coverage.fetchStartSequence') DESC LIMIT 1`).bind(feedId,sourceId).first<{provider:string;coverage:string;observations:number;proposals:number;checkedAt:string;accepted:number}>(),
  db.prepare(`SELECT json_extract(data,'$.request.coverage.status') AS coverage,
    json_array_length(json_extract(data,'$.request.observations')) AS observations,
    json_array_length(json_extract(data,'$.request.proposals')) AS proposals,
    json_extract(data,'$.request.coverage.createdAt') AS checkedAt,
    receipts IS NOT NULL AS accepted
    FROM connector_batches WHERE feed_id=? AND feed_source_id=?
    ORDER BY json_extract(data,'$.request.coverage.fetchStartSequence') DESC LIMIT 1`).bind(feedId,sourceId).first<{coverage:string;observations:number;proposals:number;checkedAt:string;accepted:number}>(),
  db.prepare(`SELECT json_extract(data,'$.request.coverage.createdAt') AS checkedAt,json_extract(data,'$.request.coverage.fetchStartSequence') AS sequence FROM connector_provider_batches
    WHERE feed_id=? AND feed_source_id=? AND receipts IS NOT NULL ORDER BY json_extract(data,'$.request.coverage.createdAt') DESC LIMIT 1`).bind(feedId,sourceId).first<{checkedAt:string;sequence:number}>(),
  db.prepare(`SELECT json_extract(data,'$.request.coverage.createdAt') AS checkedAt,json_extract(data,'$.request.coverage.fetchStartSequence') AS sequence FROM connector_batches
    WHERE feed_id=? AND feed_source_id=? AND receipts IS NOT NULL ORDER BY json_extract(data,'$.request.coverage.createdAt') DESC LIMIT 1`).bind(feedId,sourceId).first<{checkedAt:string;sequence:number}>(),
  db.prepare(`SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.request.observations'))),0) AS observations,
    COALESCE(SUM(CASE WHEN receipts IS NOT NULL THEN json_array_length(json_extract(data,'$.request.proposals')) ELSE 0 END),0) AS proposed
    FROM connector_provider_batches WHERE feed_id=? AND feed_source_id=?`).bind(feedId,sourceId).first<{observations:number;proposed:number}>(),
  db.prepare(`SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.request.observations'))),0) AS observations,
    COALESCE(SUM(CASE WHEN receipts IS NOT NULL THEN json_array_length(json_extract(data,'$.request.proposals')) ELSE 0 END),0) AS proposed
    FROM connector_batches WHERE feed_id=? AND feed_source_id=?`).bind(feedId,sourceId).first<{observations:number;proposed:number}>(),
  db.prepare('SELECT provider_id AS provider,cursor,sequence FROM connector_provider_cursors WHERE feed_id=? AND feed_source_id=? ORDER BY sequence DESC LIMIT 1').bind(feedId,sourceId).first<{provider:string;cursor:string;sequence:number}>(),
  db.prepare('SELECT sequence,data FROM connector_checkpoints WHERE feed_id=? AND feed_source_id=?').bind(feedId,sourceId).first<{sequence:number;data:string}>(),
  db.prepare(`SELECT state,due_at AS dueAt,last_error AS lastError FROM connector_provider_poll_jobs
    WHERE json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=?
    ORDER BY due_at DESC LIMIT 1`).bind(feedId,sourceId).first<{state:string;dueAt:string;lastError:string|null}>(),
  db.prepare(`SELECT state,due_at AS dueAt,last_error AS lastError FROM connector_rss_poll_jobs
    WHERE json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=?
    ORDER BY due_at DESC LIMIT 1`).bind(feedId,sourceId).first<{state:string;dueAt:string;lastError:string|null}>(),
  db.prepare(`SELECT due_at AS dueAt FROM connector_provider_poll_jobs WHERE state='PENDING'
    AND json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=?
    ORDER BY due_at LIMIT 1`).bind(feedId,sourceId).first<{dueAt:string}>(),
  db.prepare(`SELECT due_at AS dueAt FROM connector_rss_poll_jobs WHERE state='PENDING'
    AND json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=?
    ORDER BY due_at LIMIT 1`).bind(feedId,sourceId).first<{dueAt:string}>(),
  db.prepare(`SELECT COUNT(*) AS count,
    COALESCE(SUM(CASE WHEN json_extract(data,'$.failure')='UNCERTAIN_PAID_SUBMISSION' THEN 1 ELSE 0 END),0) AS uncertainPaid
    FROM connector_provider_attempts WHERE feed_id=? AND feed_source_id=?`).bind(feedId,sourceId).first<{count:number;uncertainPaid:number}>(),
  db.prepare(`SELECT json_extract(data,'$.providerId') AS provider,json_extract(data,'$.failure') AS failure,json_extract(data,'$.sequence') AS sequence
    FROM connector_provider_attempts WHERE feed_id=? AND feed_source_id=?
    ORDER BY json_extract(data,'$.sequence') DESC LIMIT 1`).bind(feedId,sourceId).first<{provider:string;failure:string;sequence:number}>()
 ]);
 const batch=providerBatch??rssBatch,job=providerJob??rssJob;
 let checkpoint:unknown=rssCheckpoint?.data;
 if(typeof checkpoint==='string'){try{checkpoint=JSON.parse(checkpoint)}catch{checkpoint=undefined}}
 const nextRunAt=[nextProviderJob?.dueAt,nextRssJob?.dueAt].filter((value):value is string=>!!value).sort()[0]??null;
 const acceptedSequence=Math.max(providerSuccess?.sequence??0,rssSuccess?.sequence??0);
 const alerts=connectorOperationalAlerts({job,nextRunAt,failure:latestFailure,acceptedSequence,uncertainPaidAttempts:failures?.uncertainPaid??0},now);
 return {alerts,provider:providerBatch?.provider??(rssBatch?'rss_native':null),lastCheckedAt:run?.startedAt??null,
  lastAcceptedBatchAt:[providerSuccess?.checkedAt,rssSuccess?.checkedAt].filter((value):value is string=>!!value).sort().at(-1)??null,
  latestCoverage:batch?.coverage??null,
  lastBatch:{observations:batch?.observations??0,proposals:batch?.proposals??0,accepted:Boolean(batch?.accepted)},
  cumulative:{observations:(providerCounts?.observations??0)+(rssCounts?.observations??0),
   proposedInReceiptedBatches:(providerCounts?.proposed??0)+(rssCounts?.proposed??0)},
  checkpoint:providerCursor?{provider:providerCursor.provider,cursor:providerCursor.cursor,sequence:providerCursor.sequence}:
   rssCheckpoint?{provider:'rss_native',sequence:rssCheckpoint.sequence,data:checkpoint}:null,
  latestJob:job?{state:job.state,dueAt:job.dueAt,lastError:job.lastError}:null,
  nextRunAt,
  providerFailures:failures?.count??0,latestProviderFailure:latestFailure??null,
  uncertainPaidAttempts:failures?.uncertainPaid??0};
}

/** Active warnings only; cumulative historical failures remain separate. */
export function connectorOperationalAlerts(input:{job?:{state:string;lastError:string|null}|null;nextRunAt:string|null;failure?:{failure:string;sequence:number}|null;acceptedSequence:number;uncertainPaidAttempts?:number},now=new Date()){
 const alerts:{code:string;severity:'warning'|'error'}[]=[];
 if(input.job?.state==='BLOCKED')alerts.push({code:'SOURCE_BLOCKED',severity:'error'});
 if(input.failure&&input.failure.sequence>input.acceptedSequence){
  const code=input.failure.failure;
  if(['AUTH_REQUIRED','BUDGET_EXCEEDED'].includes(code))alerts.push({code,severity:'error'});
 }
 // A newer successful poll does not settle an older potentially billed call.
 if((input.uncertainPaidAttempts??0)>0||input.failure?.failure==='UNCERTAIN_PAID_SUBMISSION')alerts.push({code:'PAID_RECONCILIATION_REQUIRED',severity:'warning'});
 if(input.nextRunAt&&now.getTime()-Date.parse(input.nextRunAt)>30*60000)alerts.push({code:'POLL_BACKLOG_OVERDUE',severity:'warning'});
 return alerts;
}
