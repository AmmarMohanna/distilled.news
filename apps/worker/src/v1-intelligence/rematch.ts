import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction} from './store';
export interface RematchRequest {id:string;feedId:string;jobId:string;evidenceRevisionId:string;createdAt:string;policyVersion:string}
export interface RematchAttempt {id:string;feedId:string;requestId:string;attempt:number;state:'SUCCEEDED'|'DEFERRED'|'EXHAUSTED';nextAttemptAt?:string;createdAt:string;reason?:string}
export async function scheduleRematch(tx:FeedTransaction,jobId:string,evidenceRevisionId:string,now:string):Promise<void> {
 const id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,policy:'semantic-rematch-v1'}));
 if(!await tx.read('rematch_requests',id))await tx.write('rematch_requests',id,{id,feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,createdAt:now,policyVersion:'semantic-rematch-v1'} satisfies RematchRequest);
}
export function nextRematch(request:RematchRequest,attempts:RematchAttempt[],now:string):number|undefined {
 const prior=attempts.filter(a=>a.requestId===request.id).sort((a,b)=>b.attempt-a.attempt)[0];
 if(prior?.state==='SUCCEEDED'||prior?.state==='EXHAUSTED'||prior && prior.attempt>=3 || prior?.nextAttemptAt && prior.nextAttemptAt>now)return undefined;return (prior?.attempt??0)+1;
}
