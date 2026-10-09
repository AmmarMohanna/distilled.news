import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {V1FeedStore} from './store';
import {publicationWindow} from './runtime';
import {livePublicationWindow} from './schedule';
/** Independent read detects absence even when cron itself never ran. It never
 * invents a request or historical quiet result. Suitable for external health polling. */
export async function readScheduleAudit(db:D1Database,feedId:string,now=new Date()){
 const store=new V1FeedStore(db),feed=await store.getFeed(feedId);if(!feed)return {state:'NOT_ENROLLED'};
 if(feed.paused||feed.deletedAt)return {state:'SKIPPED_WITH_REASON',reason:feed.deletedAt?'DELETED':'PAUSED'};
 if(!feed.briefingSchedule&&feed.briefingFrequency==='WEEKLY')return {state:'SKIPPED_WITH_REASON',reason:'HISTORICAL_WEEKLY_NOT_LIVE'};
 const window=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now),requestId=await sha256(canonicalJson({feedId,start:window.start,end:window.end}));
 if(Date.parse(window.end)<Date.parse(feed.createdAt))return {state:'NOT_DUE',window};
 const request=await store.read<any>(feedId,'briefing_requests',requestId);
 if(!request)return {state:now.getTime()-Date.parse(window.end)>5*60000?'MISSING_SCHEDULED_BOUNDARY':'AWAITING_DISPATCH',feedId,window,requestId,reason:'NO_DURABLE_REQUEST',attempts:0};
 const edition=await store.read(feedId,'editions',requestId);
 return {feedId,window,requestId,state:request.state==='DONE'?edition?'PUBLISHED':request.result==='QUIET'?'QUIET':request.result==='DEFERRED'?'DEFERRED':'COMPLETED_UNCLASSIFIED':request.state==='FAILED'?'FAILED':request.reason==='AWAITING_INTAKE_REASSESSMENT'?'DEFERRED':'REQUEST_CREATED',reason:request.failure??request.reason,attempts:request.attempts,createdAt:request.createdAt,completedAt:request.completedAt};
}
