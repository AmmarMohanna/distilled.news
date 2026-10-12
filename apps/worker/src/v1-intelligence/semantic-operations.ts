import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {semanticQuestion,findSemanticReuse,settleSemanticOperation} from './semantic-settlement';
import type {ExperimentUsage} from './salience';
import {isSemanticProcessing,semanticCostLimit,summarizeSemanticWallet,SEMANTIC_CALL_RESERVATION_USD,type SemanticWorkClass} from './semantic-admission';
export interface SemanticOperationInput {feedId:string;feedRevision:number;evidenceRevisionIds:string[];kind:string;policyVersion:string;model:string;budgetKey:string;state:unknown}
export interface SemanticValidationDiagnostic {stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING';response:Record<string,unknown>;rejection:{name:string;code?:string;issues?:{code:string;path:(string|number)[]}[]}}
/** Unvalidated output is retained for audit only, never accepted as semantic state. */
export class SemanticValidationError extends Error {constructor(readonly diagnostic:SemanticValidationDiagnostic){super('SEMANTIC_CONSTRUCTION_REJECTED')}}
export interface SemanticIntent {id:string;feedId:string;input:SemanticOperationInput;token:string;leaseUntil:number;reservedCostUsd:number;createdAt:string;compatibilityHash?:string}
export interface SemanticOperationResult<T=unknown> {id:string;feedId:string;input:SemanticOperationInput;status:'SUCCEEDED'|'DEFERRED';value?:T;failure?:string;validationDiagnostic?:SemanticValidationDiagnostic;usage:ExperimentUsage;latencyMs:number;createdAt:string}
export class SemanticContentionError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
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
export async function durableSemanticOperation<T>(store:V1FeedStore,input:SemanticOperationInput,run:()=>Promise<{value:T;usage:ExperimentUsage}>,now:string,reportedUsage?:()=>ExperimentUsage,options:{preserveStartedEditorialScope?:boolean;lane?:BudgetLane;reuseContext?:unknown;reservationCostUsd?:number;operationAdmission?:{fits:boolean;reason?:string;reservationCostUsd:number}}={}):Promise<SemanticOperationResult<T>> {
 const reservation=options.operationAdmission?.reservationCostUsd??options.reservationCostUsd??SEMANTIC_CALL_RESERVATION_USD;
 if(!Number.isFinite(reservation)||reservation<0)throw new HandoffError('INVALID_REQUEST');
 // The durable intent must commit before a call; real D1 row limits fail here
 // before provider use. Model context is admitted by the model adapter, not an
 // unrelated 48KB document-size rule.
 if(!input.policyVersion || !input.model || !input.kind || !input.budgetKey || !Number.isFinite(Date.parse(now)))throw new HandoffError('INVALID_REQUEST');
 const originalId=await sha256(canonicalJson(input)),token=crypto.randomUUID();
 const legacyDenial=isSemanticProcessing(input)?await store.read<SemanticOperationResult>(input.feedId,'semantic_results',originalId):undefined;
 const recoverDenied=legacyDenial?.usage.calls===0&&legacyDenial.usage.reported&&legacyDenial.failure==='SEMANTIC_BUDGET_EXHAUSTED'&&!await store.read(input.feedId,'semantic_intents',originalId);
 const id=recoverDenied?await sha256(canonicalJson({unpaidOperationId:originalId,recoveryPolicy:'semantic-cost-admission-v1'})):originalId;
 const compatibilityHash=options.reuseContext===undefined?undefined:await sha256(canonicalJson({question:semanticQuestion(input),context:options.reuseContext}));
 const acquired=await feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);
  if(recoverDenied&&await tx.read('semantic_intents',originalId))throw new HandoffError('SCOPE_DENIED');
  const prior=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(prior)return {result:prior};
  const settlement=await tx.read<SemanticOperationResult<T>&{token:string}>('semantic_settlements',id),settledIntent=settlement?await tx.read<SemanticIntent>('semantic_intents',id):undefined;
  if(settlement?.usage.reported&&settlement.token===settledIntent?.token){const {token:_,...result}=settlement;await tx.write('semantic_results',id,result);return {result}}
  if(isSemanticProcessing(input)){const reuse=await findSemanticReuse<T>(tx,input,compatibilityHash);if(reuse)return {result:reuse}}
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);
  const deferred=(failure:string,usage:ExperimentUsage):SemanticOperationResult<T>=>({id,feedId:input.feedId,input,status:'DEFERRED',failure,usage,latencyMs:0,createdAt:now});
  if(intent){if(intent.leaseUntil>Date.now())throw new SemanticContentionError();const result=deferred('SEMANTIC_OUTCOME_UNKNOWN',{calls:1,costUsd:intent.reservedCostUsd,reported:false});await tx.write('semantic_results',id,result);return {result}}
  if(options.operationAdmission&&!options.operationAdmission.fits){
   const result=deferred(`SEMANTIC_${options.operationAdmission.reason??'MODEL_CAPABILITY_UNAVAILABLE'}`,{calls:0,costUsd:0,reported:true}),waitId=JSON.stringify([id,result.failure]);
   if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,category:'MODEL_CAPACITY',admission:options.operationAdmission});
   return {result};
  }
  const rows=await tx.store.db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=?").bind(input.feedId,input.budgetKey).all<{json:string}>();
  const intents=rows.results.map(row=>JSON.parse(row.json) as SemanticIntent);
  // Atomic window fence: differing transport scopes cannot bill concurrently.
  // Recovery must restore the retained initial input rather than reserve anew.
  if(options.preserveStartedEditorialScope&&intents.some(previous=>previous.id!==id&&previous.input.kind===input.kind&&previous.input.model===input.model&&previous.input.policyVersion===input.policyVersion&&previous.input.feedRevision===input.feedRevision))throw new SemanticContentionError();await tx.preload('semantic_results',intents.map(i=>i.id));await tx.preload('semantic_settlements',intents.map(i=>i.id));
  const results=new Map<string,SemanticOperationResult>();for(const previous of intents){const saved=await tx.read<SemanticOperationResult>('semantic_results',previous.id),settled=await tx.read<SemanticOperationResult>('semantic_settlements',previous.id);if(settled?.usage.reported)results.set(previous.id,settled);else if(saved)results.set(previous.id,saved)}
  const wallet=summarizeSemanticWallet(intents,results),processing=isSemanticProcessing(input),limit=processing?semanticCostLimit(options.lane):.1;
  // Other experiment/planner budgets retain their existing contracts. Semantic
  // processing has no count lane: settled actual cost releases reservations.
  if(!processing&&(wallet.unknown>0||wallet.calls>=20)||wallet.reportedCostUsd+wallet.heldCostUsd+reservation>limit+1e-9){
   const result=deferred(!processing&&wallet.unknown>0?'SEMANTIC_BUDGET_OUTCOME_UNKNOWN':'SEMANTIC_BUDGET_EXHAUSTED',{calls:0,costUsd:0,reported:true});
   if(processing){const waitId=JSON.stringify([id,result.failure,options.lane??'PRIMARY']);if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,wallet,limitUsd:limit})}
   else await tx.write('semantic_results',id,result);
   return {result};
  }
  const value:SemanticIntent={id,feedId:input.feedId,input,token,leaseUntil:Date.now()+(input.kind==='COMPARATIVE_EDITORIAL_PLAN'?90000:30000),reservedCostUsd:reservation,createdAt:now,...(compatibilityHash?{compatibilityHash}:{})};await tx.write('semantic_intents',id,value);return {intent:value};
 });
 if(acquired.result){if(acquired.result.id!==id)console.info(JSON.stringify({type:acquired.result.status==='SUCCEEDED'?'V1_SEMANTIC_RESULT_REUSED':'V1_SEMANTIC_UNKNOWN_FENCE',feedId:input.feedId,stage:input.kind,operationId:id,retainedOperationId:acquired.result.id}));return acquired.result;}
 const started=Date.now();let value:T|undefined,failure:string|undefined,validationDiagnostic:SemanticValidationDiagnostic|undefined,usage:ExperimentUsage={calls:1,costUsd:reservation,reported:false};
 try {const outcome=await run();usage=outcome.usage;if(usage.calls!==1||!Number.isFinite(usage.costUsd)||usage.costUsd<0)throw Error('SEMANTIC_INVALID_USAGE');if(usage.reported&&usage.costUsd>reservation)console.warn(JSON.stringify({type:'V1_MODEL_COST_ESTIMATE_EXCEEDED',feedId:input.feedId,operationId:id,reservedCostUsd:reservation,reportedCostUsd:usage.costUsd}));value=outcome.value}
 catch(error){if(error instanceof SemanticValidationError && new TextEncoder().encode(JSON.stringify(error.diagnostic)).length<=16384)validationDiagnostic=error.diagnostic;const reported=reportedUsage?.();if(reported?.reported && Number.isFinite(reported.costUsd) && reported.costUsd>=0)usage=reported;failure=error instanceof Error && /^(SEMANTIC_|EXPERIMENT_|INVALID_EXPERIMENT_)/.test(error.message)?error.message:'SEMANTIC_PROVIDER_FAILURE'}
 const receipt:SemanticOperationResult<T>={id,feedId:input.feedId,input,status:failure?'DEFERRED':'SUCCEEDED',value:failure?undefined:value,failure,...(validationDiagnostic?{validationDiagnostic}:{}),usage,latencyMs:Date.now()-started,createdAt:now};
 await settleSemanticOperation(store,acquired.intent!,receipt);
 return feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);const saved=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(saved)return saved;
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);if(intent?.token!==token)throw new HandoffError('SCOPE_DENIED');
  await tx.write('semantic_results',id,receipt);return receipt;
 });
}
