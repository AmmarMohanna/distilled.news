import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,type V1FeedStore} from './store';
import {nextRematch,scheduleRematch,type RematchAttempt,type RematchRequest} from './rematch';
import {selectableForPlanning} from './planning-capacity';
import type {SelectionRecord} from './scoring';
import type {ShortlistRecord} from './shortlist';
export const PROTECTED_REASSESSMENT_POLICY='protected-correction-reassessment-v1';
export const BLOCKED_REASON='BLOCKED_PROTECTED_WORK';
const NO_PROSPECT_RECHECK_MS=6*3600000,MIN_RECHECK_MS=60000;
export interface BlockedWindow {since:string;checks:number;targets:{targetVersionId:string;causes:string[]}[];obligationIds:string[];reassessment:{requestIds:string[];prospect:'SCHEDULED'|'NEW_REQUEST_SCHEDULED'|'NONE'};signature:string;lastCheckedAt:string}
/** Why an empty selection still holds protected work. This is an honest, durable state: the window is NOT failed (no attempt is consumed),
 * the obligation stays OPEN, and the next check is tied to real reassessment progress rather than an immediate identical retry. */
export async function recordBlockedWindow(store:V1FeedStore,feedId:string,requestId:string,shortlist:ShortlistRecord,selection:Pick<SelectionRecord,'deferredProtectedTargetIds'|'omissions'>,now:string):Promise<BlockedWindow|undefined> {
 const deferred=new Set(selection.deferredProtectedTargetIds??[]);
 const targets=shortlist.candidates.filter(c=>deferred.has(c.targetVersionId)).map(c=>({c,causes:[...c.flags.filter(f=>['IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE','TITLE_EXTRACTION_PENDING'].includes(f)),...(selectableForPlanning(c)?[selection.omissions.find(o=>JSON.parse(o.candidateId)[2]===c.targetVersionId)?.reason??'PLANNER_DEFERRED']:[])]}));
 const obligationIds=[...new Set([...[...deferred].filter(id=>id.startsWith('obligation:')).map(id=>id.slice(11)),...targets.flatMap(t=>t.c.correctionObligationIds)])].sort();
 return feedTransact(store,feedId,async tx=>{
  const current=await tx.read<{state:string;attempts:number;reason?:string;nextAttemptAt?:string;blocked?:BlockedWindow}>('briefing_requests',requestId);if(!current||current.state!=='PENDING')return undefined;
  const identityRevisionIds=[...new Set(targets.filter(t=>t.causes.includes('IDENTITY_UNRESOLVED_HIGH_CONSEQUENCE')).flatMap(t=>t.c.evidenceRevisionIds))].sort();
  const requests=await tx.list<RematchRequest>('rematch_requests'),attempts=await tx.list<RematchAttempt>('rematch_attempts');
  const active=new Map((await tx.store.currentEvidence(feedId)).map(e=>[e.revision.id,e.revision]));
  const forRevisions=()=>requests.filter(r=>identityRevisionIds.includes(r.evidenceRevisionId));
  let scheduledNew=false;
  for(const revisionId of identityRevisionIds){
   const outstanding=requests.some(r=>r.evidenceRevisionId===revisionId&&nextRematch(r,attempts,'9999-12-31T00:00:00Z')!==undefined),revision=active.get(revisionId);
   // One bounded, idempotent reassessment generation per revision; an exhausted legacy request is never rewritten.
   if(!outstanding&&revision){await scheduleRematch(tx,JSON.stringify(['REASSESS',revision.sourceObservationId,'']),revisionId,now,PROTECTED_REASSESSMENT_POLICY);const fresh=(await tx.list<RematchRequest>('rematch_requests')).filter(r=>r.policyVersion===PROTECTED_REASSESSMENT_POLICY&&r.evidenceRevisionId===revisionId);if(fresh.length&&!requests.some(r=>r.id===fresh[0].id)){requests.push(fresh[0]);scheduledNew=true}}
  }
  const live=forRevisions().filter(r=>nextRematch(r,attempts,'9999-12-31T00:00:00Z')!==undefined);
  const readyAt=live.map(r=>{const prior=attempts.filter(a=>a.requestId===r.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.attempt-a.attempt)[0];return prior?.nextAttemptAt?Date.parse(prior.nextAttemptAt):Date.parse(now)});
  const prospect:BlockedWindow['reassessment']['prospect']=!live.length?'NONE':scheduledNew?'NEW_REQUEST_SCHEDULED':'SCHEDULED';
  const nextAt=new Date(live.length?Math.max(Date.parse(now)+MIN_RECHECK_MS,Math.min(...readyAt)+MIN_RECHECK_MS):Date.parse(now)+NO_PROSPECT_RECHECK_MS).toISOString();
  const signature=await sha256(canonicalJson({targets:targets.map(t=>[t.c.targetVersionId,t.causes]),obligationIds,rematch:live.map(r=>[r.id,attempts.filter(a=>a.requestId===r.id).map(a=>[a.attempt,a.state,a.reason])])}));
  const blocked:BlockedWindow={since:current.blocked?.since??now,checks:(current.blocked?.checks??0)+1,targets:targets.map(t=>({targetVersionId:t.c.targetVersionId,causes:t.causes})),obligationIds,reassessment:{requestIds:live.map(r=>r.id).sort(),prospect},signature,lastCheckedAt:now};
  await tx.write('briefing_requests',requestId,{...current,reason:BLOCKED_REASON,nextAttemptAt:nextAt,blocked});return blocked;
 });
}
