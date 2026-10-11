import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import type {ExperimentUsage} from './salience';
import {isSemanticProcessing,semanticCostLimit,summarizeSemanticWallet,SEMANTIC_CALL_RESERVATION_USD,type SemanticWorkClass} from './semantic-admission';
export interface SemanticOperationInput {feedId:string;feedRevision:number;evidenceRevisionIds:string[];kind:string;policyVersion:string;model:string;budgetKey:string;state:unknown}
export interface SemanticValidationDiagnostic {stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING';response:Record<string,unknown>;rejection:{name:string;code?:string;issues?:{code:string;path:(string|number)[]}[]}}
/** Unvalidated output is retained for audit only, never accepted as semantic state. */
export class SemanticValidationError extends Error {constructor(readonly diagnostic:SemanticValidationDiagnostic){super('SEMANTIC_CONSTRUCTION_REJECTED')}}
interface SemanticIntent {id:string;feedId:string;input:SemanticOperationInput;token:string;leaseUntil:number;reservedCostUsd:number;createdAt:string}
export interface SemanticOperationResult<T=unknown> {id:string;feedId:string;input:SemanticOperationInput;status:'SUCCEEDED'|'DEFERRED';value?:T;failure?:string;validationDiagnostic?:SemanticValidationDiagnostic;usage:ExperimentUsage;latencyMs:number;createdAt:string}
export class SemanticContentionError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
const reservation=SEMANTIC_CALL_RESERVATION_USD;
async function assertInputs(tx:FeedTransaction,input:SemanticOperationInput):Promise<void> {
 if(tx.snapshot.feed.revision!==input.feedRevision)throw new HandoffError('SCOPE_DENIED');
 const active=new Set((await tx.store.currentEvidence(input.feedId)).map(e=>e.revision.id));
 if(!input.evidenceRevisionIds.length || input.evidenceRevisionIds.some(id=>!active.has(id)))throw new HandoffError('SCOPE_DENIED');
}
/** Calls occur only after durable intent commit. Lost outcomes never reissue;
 * unknown charges retain reservations. Exact active inputs fence consumption. */
/** Work class is scheduling/accounting metadata, never part of paid identity.
 * Retries and new work share funds; verified corrections retain monetary headroom. */
export type BudgetLane=SemanticWorkClass;
export async function durableSemanticOperation<T>(store:V1FeedStore,input:SemanticOperationInput,run:()=>Promise<{value:T;usage:ExperimentUsage}>,now:string,reportedUsage?:()=>ExperimentUsage,options:{lane?:BudgetLane}={}):Promise<SemanticOperationResult<T>> {
 if(new TextEncoder().encode(canonicalJson(input.state)).length>48000 || !input.policyVersion || !input.model || !input.kind || !input.budgetKey || !Number.isFinite(Date.parse(now)))throw new HandoffError('INVALID_REQUEST');
 const id=await sha256(canonicalJson(input)),token=crypto.randomUUID();
 const acquired=await feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);
  const prior=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(prior)return {result:prior};
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);
  const deferred=(failure:string,usage:ExperimentUsage):SemanticOperationResult<T>=>({id,feedId:input.feedId,input,status:'DEFERRED',failure,usage,latencyMs:0,createdAt:now});
  if(intent){if(intent.leaseUntil>Date.now())throw new SemanticContentionError();const result=deferred('SEMANTIC_OUTCOME_UNKNOWN',{calls:1,costUsd:intent.reservedCostUsd,reported:false});await tx.write('semantic_results',id,result);return {result}}
  const rows=await tx.store.db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=?").bind(input.feedId,input.budgetKey).all<{json:string}>();
  const intents=rows.results.map(row=>JSON.parse(row.json) as SemanticIntent);await tx.preload('semantic_results',intents.map(i=>i.id));
  const results=new Map<string,SemanticOperationResult>();for(const previous of intents){const saved=await tx.read<SemanticOperationResult>('semantic_results',previous.id);if(saved)results.set(previous.id,saved)}
  const wallet=summarizeSemanticWallet(intents,results),processing=isSemanticProcessing(input),limit=processing?semanticCostLimit(options.lane):.1;
  // Other experiment/planner budgets retain their existing contracts. Semantic
  // processing has no count lane: settled actual cost releases reservations.
  if(!processing&&(wallet.unknown>0||wallet.calls>=20)||wallet.reportedCostUsd+wallet.heldCostUsd+reservation>limit+1e-9){
   const result=deferred(!processing&&wallet.unknown>0?'SEMANTIC_BUDGET_OUTCOME_UNKNOWN':'SEMANTIC_BUDGET_EXHAUSTED',{calls:0,costUsd:0,reported:true});
   if(processing){const waitId=JSON.stringify([id,result.failure,options.lane??'PRIMARY']);if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,wallet,limitUsd:limit})}
   else await tx.write('semantic_results',id,result);
   return {result};
  }
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
