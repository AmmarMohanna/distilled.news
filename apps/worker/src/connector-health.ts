import {unresolvedProviderOperationSql} from '@distilled/connectors';
/** Read-only connector diagnostics. Do not expose raw provider responses or
 * operation identifiers: they can contain source data and paid credentials. */
export async function connectorSourceHealth(db:D1Database,feedId:string,sourceId:string,now=new Date()){
 const [firstRun,run,providerBatch,rssBatch,providerSuccess,rssSuccess,providerCounts,rssCounts,providerCursor,rssCheckpoint,providerJob,rssJob,nextProviderJob,nextRssJob,failures,latestFailure,unresolved]=await Promise.all([
  db.prepare('SELECT MIN(started_at) AS startedAt,COUNT(*) AS checks FROM connector_fetch_runs WHERE feed_id=? AND feed_source_id=?').bind(feedId,sourceId).first<{startedAt:string|null;checks:number}>(),
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
  db.prepare(`SELECT json_extract(data,'$.providerId') AS provider,json_extract(data,'$.failure') AS failure,json_extract(data,'$.sequence') AS sequence,json_extract(data,'$.diagnostic.detail') AS detail,json_extract(data,'$.diagnostic.httpStatus') AS httpStatus
    FROM connector_provider_attempts WHERE feed_id=? AND feed_source_id=?
    ORDER BY json_extract(data,'$.sequence') DESC LIMIT 1`).bind(feedId,sourceId).first<{provider:string;failure:string;sequence:number;detail:string|null;httpStatus:number|null}>()
  ,db.prepare(`SELECT COUNT(*) AS count FROM connector_provider_operations WHERE feed_id=? AND feed_source_id=? AND ${unresolvedProviderOperationSql}`).bind(feedId,sourceId).first<{count:number}>()
 ]);
 const batch=providerBatch??rssBatch,job=providerJob??rssJob;
 let checkpoint:unknown=rssCheckpoint?.data;
 if(typeof checkpoint==='string'){try{checkpoint=JSON.parse(checkpoint)}catch{checkpoint=undefined}}
 const nextRunAt=[nextProviderJob?.dueAt,nextRssJob?.dueAt].filter((value):value is string=>!!value).sort()[0]??null;
 const acceptedSequence=Math.max(providerSuccess?.sequence??0,rssSuccess?.sequence??0);
 const lastAcceptedBatchAt=[providerSuccess?.checkedAt,rssSuccess?.checkedAt].filter((value):value is string=>!!value).sort().at(-1)??null;
 const observations=(providerCounts?.observations??0)+(rssCounts?.observations??0);
 const alerts=connectorOperationalAlerts({job,nextRunAt,failure:latestFailure,acceptedSequence,uncertainPaidAttempts:failures?.uncertainPaid??0,unresolvedPaidOperations:unresolved?.count??0,
  collection:{firstCheckedAt:firstRun?.startedAt??null,lastCheckedAt:run?.startedAt??null,lastAcceptedAt:lastAcceptedBatchAt,checks:firstRun?.checks??0,observations}},now);
 return {alerts,provider:providerBatch?.provider??(rssBatch?'rss_native':null),lastCheckedAt:run?.startedAt??null,
  lastAcceptedBatchAt,
  latestCoverage:batch?.coverage??null,
  lastBatch:{observations:batch?.observations??0,proposals:batch?.proposals??0,accepted:Boolean(batch?.accepted)},
  cumulative:{observations,
   proposedInReceiptedBatches:(providerCounts?.proposed??0)+(rssCounts?.proposed??0)},
  checkpoint:providerCursor?{provider:providerCursor.provider,cursor:providerCursor.cursor,sequence:providerCursor.sequence}:
   rssCheckpoint?{provider:'rss_native',sequence:rssCheckpoint.sequence,data:checkpoint}:null,
  latestJob:job?{state:job.state,dueAt:job.dueAt,lastError:job.lastError}:null,
  nextRunAt,
  providerFailures:failures?.count??0,latestProviderFailure:latestFailure??null,
  uncertainPaidAttempts:failures?.uncertainPaid??0,unresolvedPaidOperations:unresolved?.count??0};
}

/** Active warnings only; cumulative historical failures remain separate. */
/** A source that keeps being checked without an accepted batch is failing
 * silently. An accepted batch with no new items is a healthy quiet source. */
export const SOURCE_NO_SUCCESS_AFTER_MS=48*60*60*1000;
/** A source checked this many times without a single item has never been proven to collect. */
export const SOURCE_UNPROVEN_AFTER_CHECKS=3;
export function connectorOperationalAlerts(input:{job?:{state:string;lastError:string|null}|null;nextRunAt:string|null;failure?:{failure:string;sequence:number}|null;acceptedSequence:number;uncertainPaidAttempts?:number;unresolvedPaidOperations?:number;
 collection?:{firstCheckedAt:string|null;lastCheckedAt:string|null;lastAcceptedAt:string|null;checks:number;observations:number}},now=new Date()){
 const alerts:{code:string;severity:'warning'|'error'}[]=[];
 if(input.job?.state==='BLOCKED')alerts.push({code:'SOURCE_BLOCKED',severity:'error'});
 if(input.failure&&input.failure.sequence>input.acceptedSequence){
  const code=input.failure.failure;
  if(['AUTH_REQUIRED','BUDGET_EXCEEDED'].includes(code))alerts.push({code,severity:'error'});
 }
 // A newer successful poll does not settle an older potentially billed call.
 const resolutionRequired=input.unresolvedPaidOperations===undefined?(input.uncertainPaidAttempts??0)>0||input.failure?.failure==='UNCERTAIN_PAID_SUBMISSION'||input.job?.lastError==='UNCERTAIN_PAID_SUBMISSION':input.unresolvedPaidOperations>0;
 if(resolutionRequired)alerts.push({code:'PAID_RECONCILIATION_REQUIRED',severity:'warning'});
 if(input.nextRunAt&&now.getTime()-Date.parse(input.nextRunAt)>30*60000)alerts.push({code:'POLL_BACKLOG_OVERDUE',severity:'warning'});
 if(input.collection)alerts.push(...connectorCollectionAlerts(input.collection,now).map(code=>({code,severity:'warning' as const})));
 return alerts;
}

export type CollectionAlertCode='SOURCE_NO_RECENT_SUCCESS'|'SOURCE_NEVER_COLLECTED';
export interface CollectionHistory {firstCheckedAt:string|null;lastCheckedAt:string|null;lastAcceptedAt:string|null;checks:number;observations:number}
/** Shared by source health, the feed page and the pipeline trace, so all three agree. */
export function connectorCollectionAlerts(collection:CollectionHistory,now=new Date()):CollectionAlertCode[]{
 const codes:CollectionAlertCode[]=[];
 if(!collection.lastCheckedAt)return codes;
 const since=collection.lastAcceptedAt??collection.firstCheckedAt;
 // Still being checked, nothing accepted since: report how long it has been silent.
 if(since&&Date.parse(collection.lastCheckedAt)>(collection.lastAcceptedAt?Date.parse(collection.lastAcceptedAt):-Infinity)&&now.getTime()-Date.parse(since)>SOURCE_NO_SUCCESS_AFTER_MS)
  codes.push('SOURCE_NO_RECENT_SUCCESS');
 if(collection.observations===0&&collection.checks>=SOURCE_UNPROVEN_AFTER_CHECKS)codes.push('SOURCE_NEVER_COLLECTED');
 return codes;
}

/** One grouped read per table for a whole feed. Owner and admin views only. */
export async function feedCollectionAlerts(db:D1Database,feedId:string,now=new Date()):Promise<Map<string,CollectionAlertCode[]>>{
 const history=new Map<string,CollectionHistory>();
 const entry=(id:string)=>{let row=history.get(id);if(!row){row={firstCheckedAt:null,lastCheckedAt:null,lastAcceptedAt:null,checks:0,observations:0};history.set(id,row);}return row;};
 const later=(a:string|null,b:string|null)=>!a?b:!b?a:a>b?a:b;
 const [runs,providerBatches,rssBatches]=await db.batch<{sourceId:string;first?:string;last?:string;checks?:number;accepted?:string|null;observations?:number}>([
  db.prepare('SELECT feed_source_id AS sourceId,MIN(started_at) AS first,MAX(started_at) AS last,COUNT(*) AS checks FROM connector_fetch_runs WHERE feed_id=? GROUP BY feed_source_id').bind(feedId),
  ...['connector_provider_batches','connector_batches'].map(table=>db.prepare(`SELECT feed_source_id AS sourceId,
   MAX(CASE WHEN receipts IS NOT NULL THEN json_extract(data,'$.request.coverage.createdAt') END) AS accepted,
   COALESCE(SUM(json_array_length(json_extract(data,'$.request.observations'))),0) AS observations
   FROM ${table} WHERE feed_id=? GROUP BY feed_source_id`).bind(feedId)),
 ]);
 for(const row of runs.results){const h=entry(row.sourceId);h.firstCheckedAt=row.first??null;h.lastCheckedAt=row.last??null;h.checks=row.checks??0;}
 for(const row of [...providerBatches.results,...rssBatches.results]){const h=entry(row.sourceId);h.lastAcceptedAt=later(h.lastAcceptedAt,row.accepted??null);h.observations+=row.observations??0;}
 return new Map([...history].map(([id,row])=>[id,connectorCollectionAlerts(row,now)] as const).filter(([,codes])=>codes.length));
}
