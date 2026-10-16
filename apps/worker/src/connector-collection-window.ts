import {HandoffError,type CollectionBounds} from '@distilled/contracts';
import {livePublicationWindow} from './v1-intelligence/schedule';
import type {FeedRecord} from './v1-intelligence/types';
/** The first scan starts at the source's first open briefing window, not an
 * arbitrary historical lookback. Later scans resume the last finished window. */
export function initialCollectionStart(feed:FeedRecord,sourceCreatedAt:string):string {
 const created=new Date(Math.max(Date.parse(feed.createdAt),Date.parse(sourceCreatedAt)));
 if(!Number.isFinite(created.getTime()))throw new HandoffError('INVALID_REQUEST');
 if(feed.briefingSchedule)return livePublicationWindow(feed.briefingSchedule,created).end;
 if(feed.briefingFrequency==='WEEKLY'){
  const day=Date.UTC(created.getUTCFullYear(),created.getUTCMonth(),created.getUTCDate());
  return new Date(day-((created.getUTCDay()+6)%7)*86400000).toISOString();
 }
 const duration=feed.briefingFrequency==='30M'?1800000:feed.briefingFrequency==='HOURLY'?3600000:86400000;
 return new Date(Math.floor(created.getTime()/duration)*duration).toISOString();
}
export async function freezeCollectionWindow(db:D1Database,feed:FeedRecord,sourceId:string,sourceCreatedAt:string,revision:number,runId:string,now:Date):Promise<CollectionBounds>{
 const prior=await db.prepare('SELECT feed_id,feed_source_id,configuration_revision,start_time,end_time FROM connector_collection_windows WHERE run_id=?').bind(runId).first<{feed_id:string;feed_source_id:string;configuration_revision:number;start_time:string;end_time:string}>();
 if(prior){
  if(prior.feed_id!==feed.id||prior.feed_source_id!==sourceId||prior.configuration_revision!==revision)throw new HandoffError('IDEMPOTENCY_CONFLICT');
  return {startTime:prior.start_time,endTime:prior.end_time};
 }
 const done=await db.prepare(`SELECT w.end_time FROM connector_collection_windows w JOIN connector_provider_poll_jobs j ON j.job_id=w.run_id
 WHERE w.feed_source_id=? AND w.configuration_revision=? AND j.state='DONE' AND json_extract(j.result,'$.request.coverage.status')='COMPLETE' ORDER BY w.end_time DESC LIMIT 1`).bind(sourceId,revision).first<{end_time:string}>();
 const start=done?.end_time??initialCollectionStart(feed,sourceCreatedAt),end=now.toISOString();
 if(Date.parse(start)>=Date.parse(end))throw new HandoffError('INVALID_REQUEST');
 await db.prepare('INSERT INTO connector_collection_windows(run_id,feed_id,feed_source_id,configuration_revision,start_time,end_time) VALUES(?,?,?,?,?,?) ON CONFLICT(run_id) DO NOTHING').bind(runId,feed.id,sourceId,revision,start,end).run();
 const saved=await db.prepare('SELECT start_time,end_time FROM connector_collection_windows WHERE run_id=? AND feed_id=? AND feed_source_id=? AND configuration_revision=?').bind(runId,feed.id,sourceId,revision).first<{start_time:string;end_time:string}>();
 if(!saved)throw new HandoffError('IDEMPOTENCY_CONFLICT');
 return {startTime:saved.start_time,endTime:saved.end_time};
}
export async function approvedCollectionBounds(db:D1Database,r:{scope:{feedId:string;feedSourceId:string};configurationRevision?:number;runId:string;requestedBounds:CollectionBounds}):Promise<boolean>{
 const b=r.requestedBounds;
 if(Object.keys(b).length===0)return !!await db.prepare(`SELECT 1 FROM connector_provider_poll_jobs WHERE json_extract(request,'$.scope.feedId')=? AND json_extract(request,'$.scope.feedSourceId')=?
 AND json_extract(request,'$.configurationRevision')=? AND json_extract(request,'$.runId')=? AND state IN ('PENDING','BLOCKED') AND json_extract(request,'$.requestedBounds')='{}'`).bind(r.scope.feedId,r.scope.feedSourceId,r.configurationRevision??null,r.runId).first();
 if(Object.keys(b).some(k=>!['startTime','endTime'].includes(k))||!b.startTime||!b.endTime)return false;
 return !!await db.prepare(`SELECT 1 FROM connector_collection_windows w WHERE feed_id=? AND feed_source_id=? AND configuration_revision=? AND start_time=? AND end_time=?
 AND (run_id=? OR EXISTS(SELECT 1 FROM connector_provider_poll_jobs j WHERE j.state='PENDING'
 AND json_extract(j.request,'$.scope.feedId')=w.feed_id AND json_extract(j.request,'$.scope.feedSourceId')=w.feed_source_id
 AND json_extract(j.request,'$.configurationRevision')=w.configuration_revision AND json_extract(j.request,'$.runId')=?
 AND json_extract(j.request,'$.requestedBounds.startTime')=w.start_time AND json_extract(j.request,'$.requestedBounds.endTime')=w.end_time))`)
 .bind(r.scope.feedId,r.scope.feedSourceId,r.configurationRevision??null,b.startTime,b.endTime,r.runId,r.runId).first();
}
