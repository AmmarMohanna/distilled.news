import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import type {FeedTransaction,V1FeedStore} from './store';
import type {CorrectionObligation,LedgerEntry} from './ledger';
import type {EventRecord} from './types';
import type {EventMembership} from '@distilled/contracts';
export interface RematchRequest {id:string;feedId:string;jobId:string;evidenceRevisionId:string;createdAt:string;policyVersion:string}
export interface RematchAttempt {id:string;feedId:string;requestId:string;attempt:number;state:'SUCCEEDED'|'DEFERRED'|'EXHAUSTED'|'WAITING_BUDGET';nextAttemptAt?:string;createdAt:string;reason?:string}
export async function scheduleRematch(tx:FeedTransaction,jobId:string,evidenceRevisionId:string,now:string,policyVersion='semantic-rematch-v1'):Promise<void> {
 const id=await sha256(canonicalJson({feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,policy:policyVersion}));
 if(!await tx.read('rematch_requests',id))await tx.write('rematch_requests',id,{id,feedId:tx.snapshot.feed.id,jobId,evidenceRevisionId,createdAt:now,policyVersion} satisfies RematchRequest);
}
/** A stale prepared judgment is a concurrency race, not a committed semantic outcome: it does not consume one of the three semantic attempts,
 * but each race still re-prepares (and may bill) a call, so the total number of attempts stays strictly bounded. */
export const STALE_REASON='STALE_PREPARED_MEMORY',MAX_SEMANTIC_ATTEMPTS=3,MAX_STALE_RETRIES=2;
export function rematchExhausted(history:Pick<RematchAttempt,'reason'|'attempt'>[]):boolean{
 const stale=history.filter(a=>a.reason===STALE_REASON).length,numbered=Math.max(0,...history.map(a=>a.attempt));
 return Math.max(history.length-stale,numbered-stale)>=MAX_SEMANTIC_ATTEMPTS||stale>MAX_STALE_RETRIES;
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
 if(prior?.state==='EXHAUSTED'||prior&&rematchExhausted(attempts.filter(a=>a.requestId===request.id))||prior?.nextAttemptAt&&prior.nextAttemptAt>now)return undefined;return (prior?.attempt??0)+1;
}

/** Evidence whose semantic reassessment gates delivery of an OPEN correction obligation: the current support of every Event the
 * corrected ledger entry communicated. Only ordering uses it; it never resolves an obligation or asserts identity. */
export async function protectedRematchRevisionIds(store:V1FeedStore,feedId:string):Promise<Set<string>> {
 const resolved=new Set((await store.list<{obligationId:string}>(feedId,'correction_resolutions')).map(r=>r.obligationId));
 const open=(await store.list<CorrectionObligation>(feedId,'correction_obligations')).filter(o=>!resolved.has(o.id));if(!open.length)return new Set();
 const entries=new Map((await store.list<LedgerEntry>(feedId,'ledger_entries')).map(e=>[e.id,e])),eventIds=new Set(open.flatMap(o=>entries.get(o.ledgerEntryId)?.eventIds??[]));
 const memberships=await store.list<EventMembership>(feedId,'memberships'),ids=new Set<string>();
 for(const root of await store.list<EventRecord>(feedId,'events'))if(eventIds.has(root.id))for(const m of memberships)if(m.eventVersionId===root.currentVersionId)ids.add(m.evidenceRevisionId);
 return ids;
}
/** Dispatch order: reassessment that gates an open correction first, then the rest in their stable order. */
export function prioritizeRematches<T extends Pick<RematchRequest,'evidenceRevisionId'>>(requests:T[],protectedRevisionIds:Set<string>):T[] {
 return [...requests.filter(r=>protectedRevisionIds.has(r.evidenceRevisionId)),...requests.filter(r=>!protectedRevisionIds.has(r.evidenceRevisionId))];
}
