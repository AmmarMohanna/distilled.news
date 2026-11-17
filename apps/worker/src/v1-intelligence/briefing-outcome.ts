import {V1FeedStore} from './store';
import {windowIdentity,type BriefingRequest} from './runtime';
import type {PublicationWindow} from './scoring';
/** Undefined synthesis is not evidence of a quiet editorial result. */
export async function readBriefingOutcome(db:D1Database,feedId:string,window:PublicationWindow){
 const requestId=await windowIdentity(feedId,window),store=new V1FeedStore(db),request=await store.read<BriefingRequest>(feedId,'briefing_requests',requestId),edition=await store.read<{id:string}>(feedId,'editions',requestId);
 const publication=edition?await store.read<{status:string}>(feedId,'publication_status',requestId):undefined;
 const reason=request?.failure??request?.reason;
 const state=edition?(publication?.status==='PUBLISHED'?'PUBLISHED':publication?.status==='WITHDRAWN'?'WITHDRAWN':'UNKNOWN'):request?.state==='FAILED'?'FAILED':request?.state==='DONE'?request.result==='QUIET'?'NO_NEWS':request.result==='DEFERRED'?'DEFERRED':'UNKNOWN':request?.blocked||reason&&/BLOCKED|INCOMPLETE|MODEL_SETUP|ACCOUNT_|AUTHORIZATION|UNKNOWN|BUDGET|RESOURCE/.test(reason)?'BLOCKED':'PENDING';
 return {requestId,state,...(edition?{editionId:edition.id,publicationStatus:publication?.status}:{}),...(request?{result:request.result,reason,attempts:request.attempts,coverage:request.coverage,semanticCoverage:request.semanticCoverage}: {})};
}
