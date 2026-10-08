import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction} from './store';
export interface RematchRequest {id:string;feedId:string;jobId:string;evidenceRevisionId:string;createdAt:string;policyVersion:string}
export interface RematchAttempt {id:string;feedId:string;requestId:string;attempt:number;state:'SUCCEEDED'|'DEFERRED'|'EXHAUSTED'|'WAITING_BUDGET';nextAttemptAt?:string;createdAt:string;reason?:string}
export async function scheduleRematch(tx:FeedTransaction,jobId:string,evidenceRevisionId:string,now:string,policyVersion='semantic-rematch-v1'):Promise<void> {
 const id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,policy:policyVersion}));
 if(!await tx.read('rematch_requests',id))await tx.write('rematch_requests',id,{id,feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,createdAt:now,policyVersion} satisfies RematchRequest);
}
export function nextRematch(request:RematchRequest,attempts:RematchAttempt[],now:string):number|undefined {
 const prior=attempts.filter(a=>a.requestId===request.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.attempt-a.attempt)[0];
 if(attempts.some(a=>a.requestId===request.id&&a.state==='SUCCEEDED'))return undefined;
 const budgetWait=prior?.state==='WAITING_BUDGET'||prior?.reason==='SEMANTIC_BUDGET_EXHAUSTED';
 if(budgetWait){
  // A settled pre-call denial consumed no provider attempt. Legacy EXHAUSTED
  // records with this exact reason stay immutable and become a budget wait.
  // Unknown outcomes are intentionally NOT eligible for this exception.
  const reset=Date.parse(prior!.createdAt.slice(0,10)+'T00:00:00Z')+86400000;
  if(Date.parse(now)<Math.max(reset,Date.parse(prior!.nextAttemptAt??prior!.createdAt)))return undefined;
  const completed=Math.max(0,...attempts.filter(a=>a.requestId===request.id&&a.state!=='WAITING_BUDGET'&&a.reason!=='SEMANTIC_BUDGET_EXHAUSTED').map(a=>a.attempt));
  return completed<3?completed+1:undefined;
 }
 if(prior?.state==='EXHAUSTED'||prior&&prior.attempt>=3||prior?.nextAttemptAt&&prior.nextAttemptAt>now)return undefined;return (prior?.attempt??0)+1;
}
