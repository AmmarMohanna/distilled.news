import { HandoffError, timestampSchema, type IntakeReceipt } from '@distilled/contracts';
import { V1IntakeStore } from './store';
import { transact } from './transaction';
import { canonicalJson } from './canonical';
import { acceptAcquiredContent, acquiredSchema } from './evidence';
import { requireAcquisitionLease } from './acquisition-lease';
import type { AcceptedAcquiredContent, AcceptedInput, CandidateRecord, DownstreamJob, IntakePolicy } from './types';

const MAX_ATTEMPTS=5, LEASE_MS=90_000;
export interface AcquisitionClaim {job:DownstreamJob;input:AcceptedInput;candidate:CandidateRecord;token:string}
export type AcquisitionFailureCode='NETWORK'|'RATE_LIMIT'|'AUTH_REQUIRED'|'CHALLENGE_REQUIRED'|'POLICY_DENIED'|'UNSUPPORTED'|'EXTRACTION_FAILED'|'INVALID_RESULT'|'BUDGET_EXHAUSTED'|'APPROVAL_REVOKED'|'IDEMPOTENCY_CONFLICT';
export class AcquisitionFailure extends Error {
 constructor(readonly code:AcquisitionFailureCode,readonly transient:boolean) {super(code)}
}
export async function claimAcquisition(store:V1IntakeStore,id:string,rawNow:string):Promise<AcquisitionClaim|undefined> {
 const now=timestampSchema.parse(rawNow),row=await store.read<DownstreamJob>('jobs',id);
 if(!row || row.value.kind!=='ACQUIRE') return undefined;
 return transact(store,row.feedSourceId,async tx=>{
  const job=await tx.read<DownstreamJob>('jobs',id);
  if(!job || job.state==='DONE' || job.state==='FAILED' || job.exhausted) return undefined;
  if(job.state==='RUNNING' && job.leaseUntil && Date.parse(job.leaseUntil)>Date.parse(now)) return undefined;
  if(job.nextAttemptAt && Date.parse(job.nextAttemptAt)>Date.parse(now)) return undefined;
  const input=await tx.read<AcceptedInput>('inputs',job.observationId),receipt=await tx.read<IntakeReceipt>('intake_receipts',job.observationId);
  if(!input || receipt?.decision!=='ACCEPTED' || !receipt.candidateItemId || input.observation.operation!=='UPSERT') throw new HandoffError('INVALID_REQUEST');
  const candidate=await tx.read<CandidateRecord>('candidates',receipt.candidateItemId);
  if(!candidate || job.feedId!==tx.snapshot.scope.feedId || candidate.feedId!==job.feedId || candidate.feedSourceId!==job.feedSourceId || candidate.sourceItemKey!==input.observation.sourceItemKey) throw new HandoffError('SCOPE_DENIED');
  // A fetched result survives repeated worker crashes without spending another provider attempt.
  const result=await tx.read<AcceptedAcquiredContent>('acquisition_results',id);
  if((job.attempts>=MAX_ATTEMPTS && !result) || (result && (job.resumeAttempts??0)>=MAX_ATTEMPTS)) {tx.write('jobs',id,{...job,state:'FAILED',exhausted:true,failureCode:'RECOVERY_EXHAUSTED',leaseToken:undefined,leaseUntil:undefined},input.observation.sourceItemKey);return undefined}
  const token=crypto.randomUUID(),claimed:DownstreamJob={...job,state:'RUNNING',attempts:job.attempts+(result?0:1),resumeAttempts:(job.resumeAttempts??0)+(result?1:0),leaseToken:token,leaseUntil:new Date(Date.parse(now)+LEASE_MS).toISOString(),nextAttemptAt:undefined};
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
export async function runAcquisitionJob(store:V1IntakeStore,id:string,policy:IntakePolicy,execute:(claim:AcquisitionClaim)=>Promise<AcceptedAcquiredContent>):Promise<'DONE'|'SKIPPED'|'RETRY'|'FAILED'> {
 const claim=await claimAcquisition(store,id,policy.now());if(!claim) return 'SKIPPED';
 try {
  if(!await store.read('acquisition_results',id)) await persistAcquisitionResult(store,claim,await execute(claim),policy.now());
  await completeAcquisition(store,claim,policy);return 'DONE';
 } catch(error) {
  // Unexpected crashes/DB outages leave the lease recoverable. Only adapter-classified failures change retry policy.
  let failure=error instanceof AcquisitionFailure?error:undefined;
  if(error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE') failure=new AcquisitionFailure(error.code==='SCOPE_DENIED'?'APPROVAL_REVOKED':error.code==='IDEMPOTENCY_CONFLICT'?'IDEMPOTENCY_CONFLICT':'INVALID_RESULT',false);
  if(!failure) throw error;
  const classified=failure;
  return transact(store,claim.job.feedSourceId,async tx=>{
   const job=await requireAcquisitionLease(tx,id,claim.token,policy.now());
   const retry=classified.transient && job.attempts<MAX_ATTEMPTS;
   tx.write('jobs',id,{...job,state:retry?'PENDING':'FAILED',failureCode:classified.code,leaseToken:undefined,leaseUntil:undefined,exhausted:!retry,nextAttemptAt:retry?new Date(Date.parse(policy.now())+30_000*2**(job.attempts-1)).toISOString():undefined},claim.input.observation.sourceItemKey);
   return retry?'RETRY':'FAILED';
  });
 }
}
