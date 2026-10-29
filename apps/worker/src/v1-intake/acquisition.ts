import {validArticleRedirect,type ArticleRedirectEvidence} from './article-redirect';
import { HandoffError, timestampSchema, sha256, type IntakeReceipt } from '@distilled/contracts';
import {unresolvedProviderOperationSql,statelessZyteTarget} from '@distilled/connectors';
import {WorkerPublicSourceFetch} from '../public-source-fetch';
import { V1IntakeStore } from './store';
import { transact } from './transaction';
import { canonicalJson } from './canonical';
import { acceptAcquiredContent, acquiredSchema } from './evidence';
import { requireAcquisitionLease } from './acquisition-lease';
import {sameArticleUrl,scholarlyAbstractAlias} from './article-url-identity';
import type { AcceptedAcquiredContent, AcceptedInput, CandidateRecord, DownstreamJob, IntakePolicy, PublicHttpRecoveryEvidence } from './types';

const MAX_ATTEMPTS=5, LEASE_MS=90_000;
function attemptLimit(job:DownstreamJob):number {
 const last=job.recoveryAuthorizations?.at(-1);
 return last&&Number.isInteger(last.maxAttempts)&&last.maxAttempts>=1&&last.maxAttempts<=10?last.maxAttempts:MAX_ATTEMPTS;
}
/** Operator-only: no public API or automatic grant. Cumulative attempt counts,
 * source identity, paid identities and terminal failure history survive. */
export async function authorizeAcquisitionRecovery(store:V1IntakeStore,id:string,approvalId:string,rawNow:string,redirectEvidence?:{from:string;to:string},canonicalEvidence?:{from:string;to:string},evidenceOrOptions?:PublicHttpRecoveryEvidence|{unpaidOnly:true;reviewedRedirect?:{from:string;to:string;headline:string}},redirectProof?:ArticleRedirectEvidence):Promise<void>{
 const options=evidenceOrOptions&&'unpaidOnly' in evidenceOrOptions?evidenceOrOptions:undefined;
 const publicHttpEvidence=evidenceOrOptions&&'url' in evidenceOrOptions?evidenceOrOptions:undefined;
 const now=timestampSchema.parse(rawNow);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(approvalId))throw Error('INVALID_RECOVERY_APPROVAL');
 const row=await store.read<DownstreamJob>('jobs',id);if(!row)throw Error('RECOVERY_JOB_MISSING');
 const refusal=await transact(store,row.feedSourceId,async tx=>{
  const job=await tx.read<DownstreamJob>('jobs',id);if(!job||job.kind!=='ACQUIRE')return 'RECOVERY_JOB_MISSING';
  const prior=job.recoveryAuthorizations?.find(a=>a.id===approvalId);
  if(prior){if(options?.unpaidOnly&&!prior.unpaidOnly)return 'RECOVERY_APPROVAL_MODE_MISMATCH';return;}
  if(options?.unpaidOnly&&job.failureCode==='UNCERTAIN_PAID_SUBMISSION')return 'RECOVERY_PAID_OUTCOME_UNRESOLVED';
  const fenced=job.failureCode==='UNCERTAIN_PAID_SUBMISSION'&&job.failureDetail==='ARTICLE_PROVIDER_OUTCOME_UNCERTAIN';
  let canonicalAlias=false;
  if(canonicalEvidence&&job.failureCode==='INVALID_RESULT'&&['FALLBACK_CANONICAL_MISMATCH','FALLBACK_URL_MISMATCH','ARTICLE_REDIRECT_IDENTITY_MISMATCH'].includes(job.failureDetail??'')){
   const input=await tx.read<AcceptedInput>('inputs',job.observationId);
   try{
    new WorkerPublicSourceFetch(canonicalEvidence.from);new WorkerPublicSourceFetch(canonicalEvidence.to);
    canonicalAlias=input?.observation.canonicalUrl===canonicalEvidence.from&&(canonicalEvidence.from!==canonicalEvidence.to||options?.unpaidOnly===true)&&(sameArticleUrl(canonicalEvidence.from,canonicalEvidence.to)||scholarlyAbstractAlias(canonicalEvidence.from,canonicalEvidence.to));
   }catch{/* Unsafe or unproven canonical aliases never authorize recovery. */}
  }
  let reviewedRedirect=false;
  if(options?.reviewedRedirect){
   const r=options.reviewedRedirect,input=await tx.read<AcceptedInput>('inputs',job.observationId);
   try{new WorkerPublicSourceFetch(r.from);new WorkerPublicSourceFetch(r.to);
    reviewedRedirect=options.unpaidOnly===true&&input?.observation.canonicalUrl===r.from&&r.from!==r.to&&new URL(r.from).origin===new URL(r.to).origin&&r.headline.trim().length>=20&&r.headline.length<=1000&&['INVALID_RESULT','EXTRACTION_FAILED','NETWORK','RECOVERY_EXHAUSTED'].includes(job.failureCode??'');
   }catch{/* Reviewed redirects must still be public and source-bound. */}
   if(!reviewedRedirect)return 'RECOVERY_FAILURE_NOT_ELIGIBLE';
  }
  let publicRedirect=false;
  if(redirectEvidence&&job.failureCode==='POLICY_DENIED'&&!job.httpStatus&&!job.failureDetail){
   const input=await tx.read<AcceptedInput>('inputs',job.observationId);
   try{
    new WorkerPublicSourceFetch(redirectEvidence.from);new WorkerPublicSourceFetch(redirectEvidence.to);
    publicRedirect=input?.observation.canonicalUrl===redirectEvidence.from&&redirectEvidence.from!==redirectEvidence.to&&(new URL(redirectEvidence.from).origin!==new URL(redirectEvidence.to).origin||options?.unpaidOnly===true);
   }catch{/* Unsafe redirects never grant recovery. */}
  }
  let verifiedRedirect=false;
  if(redirectProof&&job.failureCode==='INVALID_RESULT'&&job.failureDetail==='FALLBACK_URL_MISMATCH'){
   const input=await tx.read<AcceptedInput>('inputs',job.observationId);
   verifiedRedirect=!!input?.observation.canonicalUrl&&validArticleRedirect(redirectProof,input.observation.canonicalUrl,redirectProof.resolvedUrl);
  }
  let publicHttpConfirmed=false;
  // Operator evidence from a fresh successful exact-article extraction can
  // reopen an undiagnosed legacy policy failure once. Explicit access/policy
  // refusals and unsafe URLs remain ineligible; the ordinary router revalidates.
  if(publicHttpEvidence&&job.failureCode==='POLICY_DENIED'&&!job.httpStatus&&!job.failureDetail){
   const input=await tx.read<AcceptedInput>('inputs',job.observationId);
   try{
    new WorkerPublicSourceFetch(publicHttpEvidence.url);
    const age=Date.parse(now)-Date.parse(timestampSchema.parse(publicHttpEvidence.observedAt));
    publicHttpConfirmed=input?.observation.canonicalUrl===publicHttpEvidence.url&&publicHttpEvidence.status===200&&
     /^[a-f0-9]{64}$/.test(publicHttpEvidence.bodyHash)&&Number.isSafeInteger(publicHttpEvidence.textCharacters)&&publicHttpEvidence.textCharacters>=200&&publicHttpEvidence.textCharacters<=500000&&age>=0&&age<=300000;
   }catch{/* Missing or unsafe operator evidence never grants recovery. */}
  }
  if(job.state!=='FAILED'||!job.exhausted||!['NETWORK','EXTRACTION_FAILED','RECOVERY_EXHAUSTED','CHALLENGE_REQUIRED','BODY_BUDGET_EXCEEDED'].includes(job.failureCode??'')&&!(job.failureCode==='UNSUPPORTED'&&job.failureDetail==='LISTING_PAGE')&&!fenced&&!publicRedirect&&!canonicalAlias&&!publicHttpConfirmed&&!verifiedRedirect&&!reviewedRedirect)return 'RECOVERY_FAILURE_NOT_ELIGIBLE';
  if(job.attempts>=10||!tx.snapshot.scope.enabled||await tx.read('acquisition_results',id))return 'RECOVERY_NOT_ELIGIBLE';
  const paid=await store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='connector_provider_operations'").first();
  if(paid){
   const pending=await store.db.prepare(`SELECT provider_id,headers FROM connector_provider_operations WHERE feed_source_id=? AND ${unresolvedProviderOperationSql}`).bind(row.feedSourceId).all<{provider_id:string;headers:string|null}>();
   const active=(headers:string|null)=>{try{const claim=JSON.parse(headers??'{}'),until=Date.parse(claim.claimExpiresAt),at=Date.parse(now);return !claim.failure&&typeof claim.claimToken==='string'&&until>at&&until<=at+180_000}catch{return false}};
   const input=await tx.read<AcceptedInput>('inputs',job.observationId);
   const normalize=(url:unknown)=>statelessZyteTarget('zyte','https://api.zyte.com/v1/extract',{method:'POST',body:JSON.stringify({url,httpResponseBody:true,httpResponseHeaders:true})});
   const target=normalize(input?.observation.canonicalUrl);
   const independent=(p:{provider_id:string;headers:string|null})=>{
    try{const h=JSON.parse(p.headers??'{}'),prior=normalize(h.statelessTarget);return p.provider_id==='zyte'&&target!==undefined&&prior!==undefined&&prior!==target&&(h.failure?.phase!==undefined||Date.parse(h.claimExpiresAt)<=Date.parse(now))}catch{return false}
   };
   if(pending.results.some(p=>!active(p.headers)&&!independent(p)))return 'RECOVERY_PAID_OUTCOME_UNRESOLVED';
  }
  if(fenced){
   if(!paid)return 'RECOVERY_FAILURE_NOT_ELIGIBLE';
   const input=await tx.read<AcceptedInput>('inputs',job.observationId),o=input?.observation;if(!o?.canonicalUrl)return 'RECOVERY_NOT_ELIGIBLE';
   const operationId=await sha256(JSON.stringify([{feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId},JSON.stringify(['article-fallback-v1',job.id,o.canonicalUrl])]));
   const own=await store.db.prepare('SELECT payload_ref FROM connector_provider_operations WHERE operation_id=? LIMIT 1').bind(operationId).first<{payload_ref:string|null}>();
   if(own&&!own.payload_ref)return 'RECOVERY_PAID_RESULT_LOST';
   const completed=await store.db.prepare("SELECT 1 FROM connector_provider_operations WHERE feed_source_id=? AND status=200 AND (payload_ref IS NOT NULL OR json_extract(headers,'$.reconciliation.kind')='COMPLETED_RESPONSE_LOST') LIMIT 1").bind(row.feedSourceId).first();
   if(!completed)return 'RECOVERY_FAILURE_NOT_ELIGIBLE';
  }
  const history=[...(job.recoveryAuthorizations??[]),{...(options?.unpaidOnly?{unpaidOnly:true as const}:{}),...(reviewedRedirect?{reviewedRedirect:options!.reviewedRedirect}:{}),id:approvalId,authorizedAt:now,priorAttempts:job.attempts,priorFailureCode:job.failureCode!,priorFailureDetail:job.failureDetail,maxAttempts:job.attempts+1,...(publicRedirect?{redirectEvidence}:{} ),...(canonicalAlias?{canonicalEvidence}:{}),...(publicHttpConfirmed?{publicHttpEvidence}:{}),...(verifiedRedirect?{redirectProof}:{})}];
  tx.write('jobs',id,{...job,state:'PENDING',exhausted:false,nextAttemptAt:now,leaseToken:undefined,leaseUntil:undefined,recoveryAuthorizations:history});
 });
 if(refusal)throw Error(refusal);
}
export interface AcquisitionClaim {job:DownstreamJob;input:AcceptedInput;candidate:CandidateRecord;token:string}
export type AcquisitionFailureCode='NETWORK'|'BACKPRESSURE'|'RATE_LIMIT'|'AUTH_REQUIRED'|'CHALLENGE_REQUIRED'|'POLICY_DENIED'|'UNSUPPORTED'|'EXTRACTION_FAILED'|'INVALID_RESULT'|'BUDGET_EXHAUSTED'|'BODY_BUDGET_EXCEEDED'|'APPROVAL_REVOKED'|'IDEMPOTENCY_CONFLICT'|'UNCERTAIN_PAID_SUBMISSION';
export class AcquisitionFailure extends Error {
 constructor(readonly code:AcquisitionFailureCode,readonly transient:boolean,readonly diagnostic?:{detail:string;httpStatus?:number;retryNotBefore?:string}) {super(code)}
}
export async function claimAcquisition(store:V1IntakeStore,id:string,rawNow:string,leaseMs=LEASE_MS):Promise<AcquisitionClaim|undefined> {
 if(!Number.isInteger(leaseMs)||leaseMs<LEASE_MS||leaseMs>180_000)throw new HandoffError('INVALID_REQUEST');
 const now=timestampSchema.parse(rawNow),row=await store.read<DownstreamJob>('jobs',id);
 if(!row || row.value.kind!=='ACQUIRE') return undefined;
 return transact(store,row.feedSourceId,async tx=>{
  const job=await tx.read<DownstreamJob>('jobs',id);
  if(!job || job.state==='DONE' || job.state==='FAILED' || job.exhausted) return undefined;
  if(job.state==='RUNNING' && job.leaseUntil && Date.parse(job.leaseUntil)>Date.parse(now)) return undefined;
  if(job.nextAttemptAt && Date.parse(job.nextAttemptAt)>Date.parse(now)) return undefined;
  await tx.prefetch([{table:'inputs',id:job.observationId},{table:'intake_receipts',id:job.observationId},{table:'acquisition_results',id}]);
  const input=await tx.read<AcceptedInput>('inputs',job.observationId),receipt=await tx.read<IntakeReceipt>('intake_receipts',job.observationId);
  if(!input || receipt?.decision!=='ACCEPTED' || !receipt.candidateItemId || input.observation.operation!=='UPSERT') throw new HandoffError('INVALID_REQUEST');
  const candidate=await tx.read<CandidateRecord>('candidates',receipt.candidateItemId);
  if(!candidate || job.feedId!==tx.snapshot.scope.feedId || candidate.feedId!==job.feedId || candidate.feedSourceId!==job.feedSourceId || candidate.sourceItemKey!==input.observation.sourceItemKey) throw new HandoffError('SCOPE_DENIED');
  // A fetched result survives repeated worker crashes without spending another provider attempt.
  const result=await tx.read<AcceptedAcquiredContent>('acquisition_results',id);
  if((job.attempts>=attemptLimit(job) && !result) || (result && (job.resumeAttempts??0)>=MAX_ATTEMPTS)) {tx.write('jobs',id,{...job,state:'FAILED',exhausted:true,priorFailureCode:job.failureCode??job.priorFailureCode,failureCode:'RECOVERY_EXHAUSTED',failureDetail:job.failureDetail??(result?'SAVED_RESULT_RECOVERY_LIMIT':'ACQUISITION_ATTEMPT_LIMIT'),leaseToken:undefined,leaseUntil:undefined},input.observation.sourceItemKey);return undefined}
  const token=crypto.randomUUID(),claimed:DownstreamJob={...job,state:'RUNNING',attempts:job.attempts+(result?0:1),resumeAttempts:(job.resumeAttempts??0)+(result?1:0),leaseToken:token,leaseUntil:new Date(Date.parse(now)+leaseMs).toISOString(),nextAttemptAt:undefined};
  tx.write('jobs',id,claimed,input.observation.sourceItemKey);
  return {job:claimed,input,candidate,token};
 });
}
export async function persistAcquisitionResult(store:V1IntakeStore,claim:AcquisitionClaim,raw:AcceptedAcquiredContent,now:string):Promise<void> {
 const parsed=acquiredSchema.safeParse(raw);
 if(!parsed.success) throw new AcquisitionFailure('INVALID_RESULT',false);
 const content=parsed.data,o=claim.input.observation;
 if(content.feedId!==o.feedId || content.candidateId!==claim.candidate.id || content.sourceObservationId!==o.id || (content.sourceId && content.sourceId!==o.sourceId)) throw new AcquisitionFailure('INVALID_RESULT',false);
 await transact(store,o.feedSourceId,async tx=>{
  await requireAcquisitionLease(tx,claim.job.id,claim.token,timestampSchema.parse(now));
  const previous=await tx.read<AcceptedAcquiredContent>('acquisition_results',claim.job.id);
  if(previous && canonicalJson(previous)!==canonicalJson(content)) throw new HandoffError('IDEMPOTENCY_CONFLICT');
  if(!previous) tx.write('acquisition_results',claim.job.id,content,o.sourceItemKey,true);
 });
}
export async function completeAcquisition(store:V1IntakeStore,claim:AcquisitionClaim,policy:IntakePolicy) {
 const row=await store.read<AcceptedAcquiredContent>('acquisition_results',claim.job.id);
 if(!row || row.feedSourceId!==claim.job.feedSourceId) throw new HandoffError('INVALID_REQUEST');
 return acceptAcquiredContent(store,row.value,policy,{jobId:claim.job.id,token:claim.token});
}
export interface AcquisitionCompletionAdmission {
 run<T>(complete:()=>Promise<T>):Promise<T>;
 isBusy(error:unknown):boolean;
}
export async function runAcquisitionJob(store:V1IntakeStore,id:string,policy:IntakePolicy,execute:(claim:AcquisitionClaim)=>Promise<AcceptedAcquiredContent>,admission?:AcquisitionCompletionAdmission,leaseMs=LEASE_MS):Promise<'DONE'|'SKIPPED'|'RETRY'|'FAILED'> {
 // The observation lease/CAS owns acquisition claims. They need no Feed-wide
 // admission; evidence promotion below is the shared canonical boundary.
 const claim=await claimAcquisition(store,id,policy.now(),leaseMs);if(!claim) return 'SKIPPED';
 const retained=!!await store.read('acquisition_results',id);
 try {
  if(!retained) await persistAcquisitionResult(store,claim,await execute(claim),policy.now());
  const complete=()=>completeAcquisition(store,claim,policy);
  if(admission)await admission.run(complete);else await complete();
  return 'DONE';
 } catch(error) {
  if(admission?.isBusy(error)){
   // Result is already durable. Release only this acquisition claim, so the
   // next delivery can promote it without waiting 90s or refetching. A busy
   // Feed consumes neither a provider attempt nor a saved-result recovery.
   await transact(store,claim.job.feedSourceId,async tx=>{
    const job=await requireAcquisitionLease(tx,id,claim.token,policy.now());
    tx.write('jobs',id,{...job,state:'PENDING',resumeAttempts:Math.max(0,(job.resumeAttempts??0)-(retained?1:0)),leaseToken:undefined,leaseUntil:undefined},claim.input.observation.sourceItemKey);
   });
   throw error;
  }
  // Unexpected crashes/DB outages leave the lease recoverable. Only adapter-classified failures change retry policy.
  let failure=error instanceof AcquisitionFailure?error:undefined;
  if(error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE') failure=new AcquisitionFailure(error.code==='SCOPE_DENIED'?'APPROVAL_REVOKED':error.code==='IDEMPOTENCY_CONFLICT'?'IDEMPOTENCY_CONFLICT':'INVALID_RESULT',false);
  if(!failure) throw error;
  const classified=failure;
  return transact(store,claim.job.feedSourceId,async tx=>{
   const job=await requireAcquisitionLease(tx,id,claim.token,policy.now());
   if(classified.code==='BUDGET_EXHAUSTED'||classified.code==='BACKPRESSURE'){
    const jitter=[...id].reduce((n,c)=>(n+c.charCodeAt(0))%120,0)*1000;
    const wait=classified.code==='BACKPRESSURE'?Math.min(60000,5000*2**Math.min(4,job.resourceWaits??0)):300000;
    tx.write('jobs',id,{...job,state:'PENDING',attempts:Math.max(0,job.attempts-1),resourceWaits:(job.resourceWaits??0)+1,exhausted:false,failureCode:classified.code,failureDetail:classified.diagnostic?.detail,leaseToken:undefined,leaseUntil:undefined,nextAttemptAt:new Date(Math.max(Date.parse(policy.now())+wait+(classified.code==='BACKPRESSURE'?jitter%3000:jitter),Date.parse(classified.diagnostic?.retryNotBefore??'')||0)).toISOString()},claim.input.observation.sourceItemKey);
    return 'RETRY';
   }
   const retry=classified.transient && job.attempts<attemptLimit(job);
   const jitter=[...id].reduce((n,c)=>(n+c.charCodeAt(0))%3000,0);
   tx.write('jobs',id,{...job,state:retry?'PENDING':'FAILED',failureCode:classified.code,failureDetail:classified.diagnostic?.detail,httpStatus:classified.diagnostic?.httpStatus,leaseToken:undefined,leaseUntil:undefined,exhausted:!retry,nextAttemptAt:retry?new Date(Math.max(Date.parse(policy.now())+30_000*2**(job.attempts-1)+jitter,Date.parse(classified.diagnostic?.retryNotBefore??'')||0)).toISOString():undefined},claim.input.observation.sourceItemKey);
   return retry?'RETRY':'FAILED';
  });
 }
}
