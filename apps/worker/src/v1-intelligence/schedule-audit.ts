import {V1FeedStore} from './store';
import {publicationWindow,windowIdentity} from './runtime';
import {livePublicationWindow} from './schedule';
import {readEditionDelivery} from './delivery-status';
/** Independent read detects absence even when cron itself never ran. It never
 * invents a request or historical quiet result. Suitable for external health polling. */
export async function readScheduleAudit(db:D1Database,feedId:string,now=new Date()){
 const store=new V1FeedStore(db),feed=await store.getFeed(feedId);if(!feed)return {state:'NOT_ENROLLED'};
 if(feed.paused||feed.deletedAt)return {state:'SKIPPED_WITH_REASON',reason:feed.deletedAt?'DELETED':'PAUSED'};
 if(!feed.briefingSchedule&&feed.briefingFrequency==='WEEKLY')return {state:'SKIPPED_WITH_REASON',reason:'HISTORICAL_WEEKLY_NOT_LIVE'};
 const window=feed.briefingSchedule?livePublicationWindow(feed.briefingSchedule,now):publicationWindow(feed.briefingFrequency,now),requestId=await windowIdentity(feedId,window);
 if(Date.parse(window.start)<Date.parse(feed.createdAt)||Date.parse(window.end)>now.getTime())return {state:'NOT_DUE',window};
 const request=await store.read<any>(feedId,'briefing_requests',requestId);
 if(!request)return {state:now.getTime()-Date.parse(window.end)>5*60000?'MISSING_SCHEDULED_BOUNDARY':'AWAITING_DISPATCH',feedId,window,requestId,reason:'NO_DURABLE_REQUEST',attempts:0};
 const edition=await store.read(feedId,'editions',requestId),delivery=edition?await readEditionDelivery(store,feedId,requestId):undefined;
 return {feedId,window,requestId,state:request.state==='DONE'?edition?'PUBLISHED':request.result==='QUIET'?'QUIET':request.result==='DEFERRED'?'DEFERRED':'COMPLETED_UNCLASSIFIED':request.state==='FAILED'?'FAILED':request.reason==='AWAITING_INTAKE_REASSESSMENT'?'DEFERRED':['BLOCKED_PROTECTED_WORK','INCOMPLETE_INTAKE_COVERAGE','INCOMPLETE_SEMANTIC_OWNERSHIP'].includes(request.reason)?'BLOCKED':'REQUEST_CREATED',reason:request.failure??request.reason,...(request.coverage?{coverage:request.coverage}:{}),...(request.semanticCoverage?{semanticCoverage:request.semanticCoverage}:{}),attempts:request.attempts,...(request.blocked?{blocked:request.blocked}:{}),...(delivery?{delivery}:{}),createdAt:request.createdAt,completedAt:request.completedAt};
}
