import {ASYNC_MODEL_CALL_MS,ASYNC_OPERATION_LEASE_MS} from './operation-timing';
import {withLatency,measureLatency,countLatency,recordModelReceipt} from './latency';
import {settledEditorialBlockerResolved} from './editorial-blocker-successor';
import {ProviderRequestError,type ProviderDiagnostic} from '../provider-outcome';
import {withProviderReceiptSink} from '../provider-receipt';
import {renewSemanticWorkLease} from './semantic-work-lease';
import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {feedTransact,V1FeedStore,type FeedTransaction} from './store';
import {semanticQuestion,findSemanticReuse,settleSemanticOperation} from './semantic-settlement';
import type {ExperimentUsage} from './salience';
import {isSemanticProcessing,type SemanticWorkClass} from './semantic-admission';
import {modelSpendingAccount,ModelSpendingWait,modelSettlementStatement} from './model-spending';
export interface SemanticOperationInput {feedId:string;feedRevision:number;evidenceRevisionIds:string[];kind:string;policyVersion:string;model:string;budgetKey:string;state:unknown}
export interface SemanticValidationDiagnostic {stage:'OUTPUT_SCHEMA'|'CONSTRUCTION_BINDING';response:Record<string,unknown>;responseOmitted?:boolean;rejection:{name:string;code?:string;binding?:{invariant:string;path:(string|number)[]};issues?:{code:string;path:(string|number)[]}[]}}
/** Unvalidated output is retained for audit only, never accepted as semantic state. */
export class SemanticValidationError extends Error {constructor(readonly diagnostic:SemanticValidationDiagnostic){super('SEMANTIC_CONSTRUCTION_REJECTED')}}
export interface SemanticIntent {id:string;feedId:string;input:SemanticOperationInput;token:string;leaseUntil:number;reservedCostUsd:number;createdAt:string;compatibilityHash?:string}
export interface SemanticOperationResult<T=unknown> {id:string;feedId:string;input:SemanticOperationInput;status:'SUCCEEDED'|'DEFERRED';value?:T;failure?:string;validationDiagnostic?:SemanticValidationDiagnostic;providerDiagnostic?:ProviderDiagnostic;usage:ExperimentUsage;latencyMs:number;createdAt:string}
export class SemanticContentionError extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
async function assertInputs(tx:FeedTransaction,input:SemanticOperationInput):Promise<void> {
 if(tx.snapshot.feed.revision!==input.feedRevision)throw new HandoffError('SCOPE_DENIED');
 const active=new Set((await tx.store.currentEvidence(input.feedId)).map(e=>e.revision.id));
 if(!input.evidenceRevisionIds.length || input.evidenceRevisionIds.some(id=>!active.has(id)))throw new HandoffError('SCOPE_DENIED');
}
/** Calls occur only after durable intent commit. Lost outcomes never reissue;
 * unknown charges retain reservations. Exact active inputs fence consumption. */
/** Work class is scheduling/accounting metadata, never part of paid identity.
 * Retries and new work share account authority; correction ordering remains scheduling metadata. */
export type BudgetLane=SemanticWorkClass;
export async function durableSemanticOperation<T>(...args:Parameters<typeof runSemanticOperation<T>>):Promise<SemanticOperationResult<T>>{
 const input=args[1],operationId=await sha256(canonicalJson(input));
 return measureLatency('MODEL_OPERATION',()=>withLatency({feedId:input.feedId,operationId,phase:'MODEL'},async()=>{
  const result=await runSemanticOperation(...args);
  // These are durable receipt values, including replay. Aggregate cost by
  // operationId, never by invocation, to avoid double-counting paid reuse.
  recordModelReceipt(result.id,result.usage,result.latencyMs);
  return result;
 }));
}
async function runSemanticOperation<T>(store:V1FeedStore,input:SemanticOperationInput,run:()=>Promise<{value:T;usage:ExperimentUsage}>,now:string,reportedUsage?:()=>ExperimentUsage,options:{preserveStartedEditorialScope?:boolean;lane?:BudgetLane;reuseContext?:unknown;reservationCostUsd?:number;operationAdmission?:{fits:boolean;reason?:string;reservationCostUsd:number}}={}):Promise<SemanticOperationResult<T>> {
 if(store.semanticLease)await renewSemanticWorkLease(store,store.semanticLease);
 const reservation=options.operationAdmission?.reservationCostUsd??options.reservationCostUsd;
 if(reservation!==undefined&&(!Number.isFinite(reservation)||reservation<0))throw new HandoffError('INVALID_REQUEST');
 // The durable intent must commit before a call; real D1 row limits fail here
 // before provider use. Model context is admitted by the model adapter, not an
 // unrelated 48KB document-size rule.
 if(!input.policyVersion || !input.model || !input.kind || !input.budgetKey || !Number.isFinite(Date.parse(now)))throw new HandoffError('INVALID_REQUEST');
 const originalId=await sha256(canonicalJson(input)),token=crypto.randomUUID();
 const legacyDenial=isSemanticProcessing(input)?await store.read<SemanticOperationResult>(input.feedId,'semantic_results',originalId):undefined;
 const recoverDenied=legacyDenial?.usage.calls===0&&legacyDenial.usage.reported&&legacyDenial.failure==='SEMANTIC_BUDGET_EXHAUSTED'&&!await store.read(input.feedId,'semantic_intents',originalId);
 const id=recoverDenied?await sha256(canonicalJson({unpaidOperationId:originalId,recoveryPolicy:'semantic-cost-admission-v1'})):originalId;
 const compatibilityHash=options.reuseContext===undefined?undefined:await sha256(canonicalJson({question:semanticQuestion(input),context:options.reuseContext}));
 const acquired=await measureLatency('SPENDING_RESERVATION',()=>feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);
  if(recoverDenied&&await tx.read('semantic_intents',originalId))throw new HandoffError('SCOPE_DENIED');
  const prior=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(prior)return {result:prior};
  const settlement=await tx.read<SemanticOperationResult<T>&{token:string}>('semantic_settlements',id),settledIntent=settlement?await tx.read<SemanticIntent>('semantic_intents',id):undefined;
  if(settlement?.usage.reported&&settlement.token===settledIntent?.token){const {token:_,...result}=settlement;await tx.write('semantic_results',id,result);return {result}}
  if(isSemanticProcessing(input)){const reuse=await findSemanticReuse<T>(tx,input,compatibilityHash);if(reuse)return {result:reuse}}
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);
  const deferred=(failure:string,usage:ExperimentUsage):SemanticOperationResult<T>=>({id,feedId:input.feedId,input,status:'DEFERRED',failure,usage,latencyMs:0,createdAt:now});
  if(intent){if(intent.leaseUntil>Date.now())throw new SemanticContentionError();const result=deferred('SEMANTIC_OUTCOME_UNKNOWN',{calls:1,costUsd:intent.reservedCostUsd,reported:false});await tx.write('semantic_results',id,result);return {result}}
  if(store.semanticLease?.executionDeadlineMs!==undefined&&Date.now()+ASYNC_MODEL_CALL_MS>store.semanticLease.executionDeadlineMs){
   const result=deferred('SEMANTIC_EXECUTION_YIELD',{calls:0,costUsd:0,reported:true}),waitId=JSON.stringify([id,result.failure]);
   if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,category:'EXECUTION_CONTINUATION'});
   return {result};
  }
  if(options.operationAdmission&&!options.operationAdmission.fits){
   const result=deferred(`SEMANTIC_${options.operationAdmission.reason??'MODEL_CAPABILITY_UNAVAILABLE'}`,{calls:0,costUsd:0,reported:true}),waitId=JSON.stringify([id,result.failure]);
   if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,category:'MODEL_CAPACITY',admission:options.operationAdmission});
   return {result};
  }
  if(options.preserveStartedEditorialScope){
   const rows=await tx.store.db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=?").bind(input.feedId,input.budgetKey).all<{json:string}>();
   for(const row of rows.results){const p=JSON.parse(row.json) as SemanticIntent;if(p.id===id||p.input.kind!==input.kind||p.input.model!==input.model||p.input.policyVersion!==input.policyVersion||p.input.feedRevision!==input.feedRevision)continue;
    if(!await settledEditorialBlockerResolved(store,p.input,input))throw new SemanticContentionError();
    const transitionId=JSON.stringify(['SETTLED_BLOCKER_RESOLVED',p.id,id]);if(!await tx.read('editorial_processing_progress',transitionId))await tx.write('editorial_processing_progress',transitionId,{id:transitionId,feedId:input.feedId,sourceOperationId:p.id,operationId:id,reason:'SETTLED_BLOCKER_RESOLVED',createdAt:now});
   }
  }
  if(reservation===undefined){const result=deferred('SEMANTIC_COST_ESTIMATE_REQUIRED',{calls:0,costUsd:0,reported:true}),waitId=JSON.stringify([id,result.failure]);if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,category:'ACCOUNT_AUTHORIZATION'});return {result}}
  const accountId=await modelSpendingAccount(store.db,input.model,now,store.spendingAccountId);
  const value:SemanticIntent={id,feedId:input.feedId,input,token,leaseUntil:Date.now()+ASYNC_OPERATION_LEASE_MS,reservedCostUsd:reservation,createdAt:now,...(compatibilityHash?{compatibilityHash}:{})};tx.modelReservations.push({id:'semantic_intents:'+id,accountId,model:input.model,feedId:input.feedId,token,reservedCostUsd:reservation,leaseUntil:value.leaseUntil,createdAt:now});await tx.write('semantic_intents',id,value);return {intent:value};
 }).catch(async error=>{
  if(!(error instanceof ModelSpendingWait))throw error;
  const result:SemanticOperationResult<T>={id,feedId:input.feedId,input,status:'DEFERRED',failure:error.reason,usage:{calls:0,costUsd:0,reported:true},latencyMs:0,createdAt:now};
  await feedTransact(store,input.feedId,async tx=>{const waitId=JSON.stringify([id,error.reason]);if(!await tx.read('semantic_resource_waits',waitId))await tx.write('semantic_resource_waits',waitId,{...result,id:waitId,operationId:id,category:'ACCOUNT_AUTHORIZATION'})});return {result};
 }));
 if(acquired.result){if(acquired.result.id!==id)console.info(JSON.stringify({type:acquired.result.status==='SUCCEEDED'?'V1_SEMANTIC_RESULT_REUSED':acquired.result.usage.reported?'V1_SEMANTIC_REJECTED_RESULT_REUSED':'V1_SEMANTIC_UNKNOWN_FENCE',feedId:input.feedId,stage:input.kind,operationId:id,retainedOperationId:acquired.result.id}));return acquired.result;}
 const started=Date.now();let value:T|undefined,failure:string|undefined,validationDiagnostic:SemanticValidationDiagnostic|undefined,providerDiagnostic:ProviderDiagnostic|undefined,usage:ExperimentUsage={calls:1,costUsd:acquired.intent!.reservedCostUsd,reported:false};
 try {countLatency('newProviderCalls');const outcome=await measureLatency(input.kind,()=>withProviderReceiptSink(async receipt=>{
  if(receipt.model!==input.model)throw Error('SEMANTIC_PROVIDER_RECEIPT_MODEL_MISMATCH');
  const receiptId=JSON.stringify(['semantic_intents:'+id,receipt.stage]),record={...receipt,id:receiptId,reservationId:'semantic_intents:'+id,feedId:input.feedId,createdAt:new Date().toISOString()};
  const statements=[store.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'model_provider_receipts',?,?,? WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='semantic_intents' AND id=? AND feed_id=? AND json_extract(json,'$.token')=?) ON CONFLICT(kind,id) DO NOTHING").bind(receiptId,input.feedId,JSON.stringify(record),id,input.feedId,acquired.intent!.token)];
  if(receipt.stage==='USAGE'&&receipt.reportedCostUsd!==undefined)statements.push(modelSettlementStatement(store.db,'semantic_intents:'+id,acquired.intent!.token,{costUsd:receipt.reportedCostUsd,reported:true}));
  await store.db.batch(statements);
  const saved=await store.db.prepare("SELECT json FROM v1_feed_documents WHERE kind='model_provider_receipts' AND id=? AND feed_id=?").bind(receiptId,input.feedId).first<{json:string}>();
  if(!saved||JSON.parse(saved.json).generationId!==receipt.generationId||JSON.parse(saved.json).reportedCostUsd!==receipt.reportedCostUsd)throw Error('SEMANTIC_PROVIDER_RECEIPT_OWNER_MISMATCH');
 },run));usage=outcome.usage;if(usage.calls!==1||!Number.isFinite(usage.costUsd)||usage.costUsd<0)throw Error('SEMANTIC_INVALID_USAGE');if(usage.reported&&usage.costUsd>acquired.intent!.reservedCostUsd)console.warn(JSON.stringify({type:'V1_MODEL_COST_ESTIMATE_EXCEEDED',feedId:input.feedId,operationId:id,reservedCostUsd:reservation,reportedCostUsd:usage.costUsd}));value=outcome.value}
 catch(error){if(error instanceof ProviderRequestError)providerDiagnostic=error.providerDiagnostic;if(error instanceof SemanticValidationError)validationDiagnostic=new TextEncoder().encode(JSON.stringify(error.diagnostic)).length<=16384?error.diagnostic:{...error.diagnostic,response:{},responseOmitted:true};const reported=reportedUsage?.();if(reported?.reported && Number.isFinite(reported.costUsd) && reported.costUsd>=0)usage=reported;failure=error instanceof Error && /^(SEMANTIC_|EXPERIMENT_|INVALID_EXPERIMENT_)/.test(error.message)?error.message:'SEMANTIC_PROVIDER_FAILURE'}
 const receipt:SemanticOperationResult<T>={id,feedId:input.feedId,input,status:failure?'DEFERRED':'SUCCEEDED',value:failure?undefined:value,failure,...(validationDiagnostic?{validationDiagnostic}:{}),...(providerDiagnostic?{providerDiagnostic}:{}),usage,latencyMs:Date.now()-started,createdAt:now};
 await measureLatency('SPENDING_SETTLEMENT',()=>settleSemanticOperation(store,acquired.intent!,receipt));
 recordModelReceipt(receipt.id,receipt.usage,receipt.latencyMs);
 return measureLatency('RESULT_COMMIT',()=>feedTransact(store,input.feedId,async tx=>{
  await assertInputs(tx,input);const saved=await tx.read<SemanticOperationResult<T>>('semantic_results',id);if(saved)return saved;
  const intent=await tx.read<SemanticIntent>('semantic_intents',id);if(intent?.token!==token)throw new HandoffError('SCOPE_DENIED');
  await tx.write('semantic_results',id,receipt);return receipt;
 }));
}
