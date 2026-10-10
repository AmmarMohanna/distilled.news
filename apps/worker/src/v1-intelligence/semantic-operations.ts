import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import type {ExperimentUsage} from './salience';
export interface SemanticOperationInput {feedId:string;feedRevision:number;evidenceRevisionIds:string[];kind:string;policyVersion:string;model:string;budgetKey:string;state:unknown}
export interface SemanticValidationDiagnostic {stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING';response:Record<string,unknown>;rejection:{name:string;code?:string;issues?:{code:string;path:(string|number)[]}[]}}
/** Unvalidated output is retained for audit only, never accepted as semantic state. */
export class SemanticValidationError extends Error {constructor(readonly diagnostic:SemanticValidationDiagnostic){super('SEMANTIC_CONSTRUCTION_REJECTED')}}
interface SemanticIntent {id:string;feedId:string;input:SemanticOperationInput;token:string;leaseUntil:number;reservedCostUsd:number;createdAt:string}
export interface SemanticOperationResult<T=unknown> {id:string;feedId:string;input:SemanticOperationInput;status:'SUCCEEDED'|'DEFERRED';value?:T;failure?:string;validationDiagnostic?:SemanticValidationDiagnostic;usage:ExperimentUsage;latencyMs:number;createdAt:string}
export class SemanticContentionError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
const reservation=.02;
async function assertInputs(tx:FeedTransaction,input:SemanticOperationInput):Promise<void> {
 if(tx.snapshot.feed.revision!==input.feedRevision)throw new HandoffError('SCOPE_DENIED');
 const active=new Set((await tx.store.currentEvidence(input.feedId)).map(e=>e.revision.id));
 if(!input.evidenceRevisionIds.length || input.evidenceRevisionIds.some(id=>!active.has(id)))throw new HandoffError('SCOPE_DENIED');
}
/** Calls occur only after durable intent commit. Lost outcomes never reissue;
 * unknown charges retain reservations. Exact active inputs fence consumption. */
/** Who is asking for the shared per-day semantic call allowance. Not part of an operation's identity. Ordinary first-time work may use all but a
 * reserve, retries of earlier work stop sooner, and work gating an OPEN correction may use the whole allowance; the total never exceeds the cap. */
export type BudgetLane='PRIMARY'|'RETRY'|'PROTECTED';
export const SEMANTIC_DAILY_CALL_CAP=20,PROTECTED_CALL_RESERVE=4,RETRY_CALL_SHARE=12;
export const laneCallCap=(lane?:BudgetLane)=>lane==='PRIMARY'?SEMANTIC_DAILY_CALL_CAP-PROTECTED_CALL_RESERVE:lane==='RETRY'?RETRY_CALL_SHARE:SEMANTIC_DAILY_CALL_CAP;
export async function durableSemanticOperation<T>(store:V1FeedStore,input:SemanticOperationInput,run:()=>Promise<{value:T;usage:ExperimentUsage}>,now:string,reportedUsage?:()=>ExperimentUsage,options:{lane?:BudgetLane}={}):Promise<SemanticOperationResult<T>> {
 if(new TextEncoder().encode(canonicalJson(input.state)).length>48000 || !input.policyVersion || !input.model || !input.kind || !input.budgetKey || !Number.isFinite(Date.parse(now)))throw new HandoffError('INVALID_REQUEST');
 const id=await sha256(canonicalJson(input)),token=crypto.randomUUID();
 const acquired=await feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);
  const prior=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(prior)return {result:prior};
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);
  const deferred=(failure:string,usage:ExperimentUsage):SemanticOperationResult<T>=>({id,feedId:input.feedId,input,status:'DEFERRED',failure,usage,latencyMs:0,createdAt:now});
  if(intent){if(intent.leaseUntil>Date.now())throw new SemanticContentionError();const result=deferred('SEMANTIC_OUTCOME_UNKNOWN',{calls:1,costUsd:intent.reservedCostUsd,reported:false});await tx.write('semantic_results',id,result);return {result}}
  let cost=0,calls=0,unknown=false;
  for(const previous of (await tx.list<SemanticIntent>('semantic_intents')).filter(i=>i.input.budgetKey===input.budgetKey)){
   const saved=await tx.read<SemanticOperationResult>('semantic_results',previous.id);calls++;cost+=saved?.usage.reported?saved.usage.costUsd:Math.max(reservation,saved?.usage.costUsd??0);unknown ||= saved?!saved.usage.reported:previous.leaseUntil<=Date.now();
  }
  if(unknown||calls>=laneCallCap(options.lane)||cost+reservation>.1+1e-9){const result=deferred(unknown?'SEMANTIC_BUDGET_OUTCOME_UNKNOWN':'SEMANTIC_BUDGET_EXHAUSTED',{calls:0,costUsd:0,reported:true});await tx.write('semantic_results',id,result);return {result}}
  const value:SemanticIntent={id,feedId:input.feedId,input,token,leaseUntil:Date.now()+(input.kind==='COMPARATIVE_EDITORIAL_PLAN'?90000:30000),reservedCostUsd:reservation,createdAt:now};await tx.write('semantic_intents',id,value);return {intent:value};
 });
 if(acquired.result)return acquired.result;
 const started=Date.now();let value:T|undefined,failure:string|undefined,validationDiagnostic:SemanticValidationDiagnostic|undefined,usage:ExperimentUsage={calls:1,costUsd:reservation,reported:false};
 try {const outcome=await run();usage=outcome.usage;if(usage.calls!==1||!Number.isFinite(usage.costUsd)||usage.costUsd<0)throw Error('SEMANTIC_INVALID_USAGE');if(usage.costUsd>reservation)throw Error('SEMANTIC_COST_OVERRUN');value=outcome.value}
 catch(error){if(error instanceof SemanticValidationError && new TextEncoder().encode(JSON.stringify(error.diagnostic)).length<=16384)validationDiagnostic=error.diagnostic;const reported=reportedUsage?.();if(reported?.reported && Number.isFinite(reported.costUsd) && reported.costUsd>=0)usage=reported;failure=error instanceof Error && /^(SEMANTIC_|EXPERIMENT_|INVALID_EXPERIMENT_)/.test(error.message)?error.message:'SEMANTIC_PROVIDER_FAILURE'}
 return feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);const saved=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(saved)return saved;
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);if(intent?.token!==token)throw new HandoffError('SCOPE_DENIED');
  const result:SemanticOperationResult<T>={id,feedId:input.feedId,input,status:failure?'DEFERRED':'SUCCEEDED',value:failure?undefined:value,failure,...(validationDiagnostic?{validationDiagnostic}:{}),usage,latencyMs:Date.now()-started,createdAt:now};await tx.write('semantic_results',id,result);return result;
 });
}
