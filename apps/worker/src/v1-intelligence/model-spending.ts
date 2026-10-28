import {validateEvaluationScope,assertEvaluationScopeAvailable,type ModelEvaluationScope} from './model-spending-evaluation';
import {providerLimitStatements,type ProviderLimits} from './provider-limits';
import {validateRecoveryScope,assertRecoveryScopeAvailable,type ModelRecoveryScope,type RecoveryReservationBinding} from './model-spending-recovery';
import {effectiveModelConcurrency} from './model-spending-amendments';
import {effectiveModelExposure} from './model-spending-exposure-amendments';
import type {ProviderDiagnostic} from '../provider-outcome';
import {canonicalJson} from '../v1-intake/canonical';
export interface ModelSpendingAuthorization {id:string;accountId:string;modelIds:string[];validFrom:string;validUntil:string;maxExposureUsd:number;maxConcurrentOperations:number;recoveryScope?:ModelRecoveryScope;evaluationScope?:ModelEvaluationScope}
export interface ModelSpendingReservation {providerLimits?:ProviderLimits;id:string;accountId:string;model:string;feedId:string;token:string;reservedCostUsd:number;leaseUntil:number;createdAt:string;recovery?:RecoveryReservationBinding;evaluation?:{manifestHash:string;requestHash:string}}
export class ModelSpendingWait extends Error {constructor(readonly reason:string){super(reason)}}
const instant=(value:string)=>new Date(value).toISOString();
const legacyMissing=`SELECT COUNT(*) AS n FROM v1_feed_documents d WHERE d.kind IN ('semantic_intents','salience_intents','model_intents') AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r WHERE r.id=d.kind||':'||d.id)`;
/** Operator-selected accounting mode. This removes financial admission only;
 * immutable operation ownership and provider resource coordination still apply. */
async function trackingAccounts(db:D1Database,model:string,accountId?:string):Promise<{accountId:string;enabledAt:string}[]>{
 let rows;try{rows=await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'model-spending:tracking-only:%'").all<{key:string;value:string}>()}catch(error){if(String(error).includes('no such table'))return [];throw error}
 return rows.results.flatMap(row=>{const value=JSON.parse(row.value),id=row.key.slice('model-spending:tracking-only:'.length);if(value.mode!=='TRACK_ONLY')return [];if(!id||!Array.isArray(value.modelIds)||value.modelIds.some((m:unknown)=>typeof m!=='string'||!m)||!Number.isFinite(Date.parse(value.enabledAt)))throw Error('INVALID_SPENDING_TRACKING_CONFIGURATION');return (!accountId||id===accountId)&&(value.modelIds.includes(model)||value.modelIds.includes('*'))?[{accountId:id,enabledAt:instant(value.enabledAt)}]:[]});
}
/** Operator-only primitive; no public route and no implicit/default grant. Existing
 * paid liabilities require explicit account mapping/reconciliation before activation. */
export async function authorizeModelSpending(db:D1Database,grant:ModelSpendingAuthorization):Promise<void>{
 if(!grant.id||!grant.accountId||!grant.modelIds.length||grant.modelIds.some(m=>!m)||!Number.isFinite(grant.maxExposureUsd)||grant.maxExposureUsd<=0||!Number.isSafeInteger(grant.maxConcurrentOperations)||grant.maxConcurrentOperations<1||!Number.isFinite(Date.parse(grant.validFrom))||!Number.isFinite(Date.parse(grant.validUntil))||Date.parse(grant.validFrom)>=Date.parse(grant.validUntil))throw Error('INVALID_ACCOUNT_AUTHORIZATION');
 validateRecoveryScope(grant);validateEvaluationScope(grant);
 if(grant.evaluationScope&&!await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_evaluation_scope'").first())throw Error('EVALUATION_SCOPE_MIGRATION_REQUIRED');
 if(grant.recoveryScope&&!await db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='v1_model_spending_recovery_scope'").first())throw Error('RECOVERY_SCOPE_MIGRATION_REQUIRED');
 const prior=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(grant.id).first<{json:string}>();if(prior){if(canonicalJson(JSON.parse(prior.json))!==canonicalJson(grant))throw Error('ACCOUNT_AUTHORITY_IDENTITY_CONFLICT');return}
 const unreconciled=await db.prepare(legacyMissing).first<{n:number}>();if(unreconciled?.n)throw new ModelSpendingWait('LEGACY_LIABILITIES_UNRECONCILED');
 const overlap=await db.prepare('SELECT id FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<? AND valid_until>?').bind(grant.accountId,instant(grant.validUntil),instant(grant.validFrom)).first();if(overlap)throw Error('ACCOUNT_AUTHORIZATION_OVERLAP');
 const guard=crypto.randomUUID();
 await db.batch([db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN (${legacyMissing})=0 AND NOT EXISTS(SELECT 1 FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<? AND valid_until>?) THEN 1 ELSE 0 END`).bind(guard,grant.accountId,instant(grant.validUntil),instant(grant.validFrom)),db.prepare('INSERT INTO v1_model_spending_authorizations VALUES(?,?,?,?,?)').bind(grant.id,grant.accountId,instant(grant.validFrom),instant(grant.validUntil),JSON.stringify(grant)),db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)]);
}
export async function spendingAuthorization(db:D1Database,r:ModelSpendingReservation):Promise<ModelSpendingAuthorization&{concurrencyRevision:number;concurrencySchemaAvailable:boolean;exposureRevision:number;exposureSchemaAvailable:boolean}>{
 const rows=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<=? AND valid_until>?').bind(r.accountId,instant(r.createdAt),instant(r.createdAt)).all<{json:string}>();
 const grants=rows.results.map(x=>JSON.parse(x.json) as ModelSpendingAuthorization).filter(g=>g.modelIds.includes(r.model)||g.modelIds.includes('*'));if(grants.length!==1)throw new ModelSpendingWait('ACCOUNT_AUTHORIZATION_REQUIRED');return {...grants[0],...await effectiveModelConcurrency(db,grants[0].id,grants[0].maxConcurrentOperations),...await effectiveModelExposure(db,grants[0].id,grants[0].accountId,grants[0].maxExposureUsd)};
}
/** Shared exposure: period charges plus ALL unsettled liabilities, even from
 * expired owners/older grants. A new day or Feed never erases UNKNOWN money. */
export async function spendingExposure(db:D1Database,accountId:string,at:string){
 const grant=await db.prepare('SELECT valid_from,valid_until FROM v1_model_spending_authorizations WHERE account_id=? AND valid_from<=? AND valid_until>?').bind(accountId,instant(at),instant(at)).first<{valid_from:string;valid_until:string}>();
 const result=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN s.reported=1 AND r.created_at>=? AND r.created_at<? THEN s.cost_usd ELSE 0 END),0) AS reportedCostUsd,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 THEN MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) ELSE 0 END),0) AS heldCostUsd,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 THEN 1 ELSE 0 END),0) AS unsettledConcurrencySlots,COALESCE(SUM(CASE WHEN COALESCE(s.reported,0)=0 AND r.lease_until<=? THEN 1 ELSE 0 END),0) AS unknown FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=?`).bind(grant?.valid_from??instant(at),grant?.valid_until??instant(at),Date.now(),accountId).first<{reportedCostUsd:number;heldCostUsd:number;unknown:number;unsettledConcurrencySlots:number}>();
 const quarantine=await db.prepare(`SELECT COUNT(*) AS n FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=? AND COALESCE(s.reported,0)=0 AND EXISTS(SELECT 1 FROM v1_feed_documents q WHERE q.kind='model_execution_quarantines' AND q.id=r.id AND q.feed_id=r.feed_id AND json_extract(q.json,'$.accountId')=r.account_id AND json_extract(q.json,'$.reservationToken')=r.token)`).bind(accountId).first<{n:number}>();return {...result!,quarantinedConcurrencySlots:quarantine?.n??0,activeConcurrencySlots:result!.unsettledConcurrencySlots-(quarantine?.n??0)};
}
export async function modelSpendingStatements(db:D1Database,r:ModelSpendingReservation):Promise<D1PreparedStatement[]>{
 if(!r.id||!r.accountId||!r.token||!r.model||!r.feedId||!Number.isFinite(r.reservedCostUsd)||r.reservedCostUsd<0||!Number.isFinite(r.leaseUntil)||!Number.isFinite(Date.parse(r.createdAt)))throw Error('INVALID_MODEL_RESERVATION');
 if(await db.prepare("SELECT id FROM v1_feed_documents WHERE kind='model_execution_retirements' AND id=? AND feed_id=?").bind(r.feedId,r.feedId).first())throw new ModelSpendingWait('FEED_EXECUTION_RETIRED');
 const quarantined=await db.prepare("SELECT id FROM v1_feed_documents WHERE kind='model_execution_quarantines' AND id=? AND feed_id=?").bind(r.id,r.feedId).first();
 const existing=await db.prepare('SELECT json FROM v1_model_spending_reservations WHERE id=?').bind(r.id).first<{json:string}>();if(existing){if(canonicalJson(JSON.parse(existing.json))!==canonicalJson(r))throw new ModelSpendingWait('RESERVATION_IDENTITY_CONFLICT');if(quarantined)throw new ModelSpendingWait('OPERATION_EXECUTION_QUARANTINED');return []}
 if(quarantined)throw new ModelSpendingWait('OPERATION_EXECUTION_QUARANTINED');
 const tracking=await trackingAccounts(db,r.model,r.accountId);
 if(tracking.length>1)throw new ModelSpendingWait('ACCOUNT_AUTHORIZATION_REQUIRED');
 if(tracking.length===1){
  const guards=await providerLimitStatements(db,r,{accountingSince:tracking[0].enabledAt});
  return [...guards,db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,NULL,?,?,?,?,?,?,?)').bind(r.id,r.accountId,r.token,r.model,r.feedId,r.reservedCostUsd,r.leaseUntil,instant(r.createdAt),JSON.stringify(r))];
 }
 const g=await spendingAuthorization(db,r),guard=crypto.randomUUID();
 await assertEvaluationScopeAvailable(db,g,r);
 try{await assertRecoveryScopeAvailable(db,g,r)}catch(error){if(error instanceof Error&&error.message==='RECOVERY_SCOPE_DENIED')throw new ModelSpendingWait(r.feedId===g.recoveryScope?.feedId?'ACCOUNT_RECOVERY_SCOPE_DENIED':'ACCOUNT_AUTHORIZATION_REQUIRED');throw error}
 const exposure=`SELECT COALESCE(SUM(CASE WHEN s.reported=1 AND p.created_at>=? AND p.created_at<? THEN s.cost_usd WHEN COALESCE(s.reported,0)=0 THEN MAX(p.reserved_cost_usd,COALESCE(s.cost_usd,0)) ELSE 0 END),0) FROM v1_model_spending_reservations p LEFT JOIN v1_model_spending_settlements s ON s.id=p.id WHERE p.account_id=?`;
 const concurrency=`SELECT COUNT(*) FROM v1_model_spending_reservations p LEFT JOIN v1_model_spending_settlements s ON s.id=p.id WHERE p.account_id=? AND COALESCE(s.reported,0)=0 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents q WHERE q.kind='model_execution_quarantines' AND q.id=p.id AND q.feed_id=p.feed_id AND json_extract(q.json,'$.accountId')=p.account_id AND json_extract(q.json,'$.reservationToken')=p.token)`;
 const amendmentGuard=g.concurrencySchemaAvailable?' AND COALESCE((SELECT MAX(sequence) FROM v1_model_spending_concurrency_amendments WHERE authorization_id=?),0)=?':'';
 const exposureAmendmentGuard=g.exposureSchemaAvailable?' AND COALESCE((SELECT MAX(sequence) FROM v1_model_spending_exposure_amendments WHERE authorization_id=?),0)=?':'';
 const providerGuards=await providerLimitStatements(db,r);
 return [...providerGuards,db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN (${legacyMissing})=0 AND (${exposure})+?<=? AND (${concurrency})<? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind='model_execution_retirements' AND id=? AND feed_id=?) ${amendmentGuard} ${exposureAmendmentGuard} THEN 1 ELSE 0 END`).bind(guard,instant(g.validFrom),instant(g.validUntil),r.accountId,r.reservedCostUsd,g.maxExposureUsd,r.accountId,g.maxConcurrentOperations,r.feedId,r.feedId,...(g.concurrencySchemaAvailable?[g.id,g.concurrencyRevision]:[]),...(g.exposureSchemaAvailable?[g.id,g.exposureRevision]:[])),db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,?,?,?,?,?,?,?,?)').bind(r.id,r.accountId,g.id,r.token,r.model,r.feedId,r.reservedCostUsd,r.leaseUntil,instant(r.createdAt),JSON.stringify(r)),db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)];
}
export async function reserveModelSpending(db:D1Database,r:ModelSpendingReservation):Promise<void>{try{const statements=await modelSpendingStatements(db,r);if(statements.length)await db.batch(statements)}catch(e){if(String(e).includes('v1_model_provider_admission'))throw new ModelSpendingWait('PROVIDER_RESOURCE_WAIT');if(String(e).includes('v1_model_spending_admission'))throw new ModelSpendingWait('ACCOUNT_RESOURCE_WAIT');throw e}}
export function modelSettlementStatement(db:D1Database,id:string,token:string,usage:{costUsd:number;reported:boolean}):D1PreparedStatement{
 if(!Number.isFinite(usage.costUsd)||usage.costUsd<0)throw Error('INVALID_MODEL_SETTLEMENT');
 return db.prepare(`INSERT INTO v1_model_spending_settlements(id,token,cost_usd,reported) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM v1_model_spending_reservations WHERE id=? AND token=?) ON CONFLICT(id) DO UPDATE SET cost_usd=excluded.cost_usd,reported=excluded.reported WHERE v1_model_spending_settlements.token=excluded.token AND v1_model_spending_settlements.reported=0 AND (excluded.reported=1 OR excluded.cost_usd>v1_model_spending_settlements.cost_usd)`).bind(id,token,usage.costUsd,Number(usage.reported),id,token);
}
export async function settleModelSpending(db:D1Database,id:string,token:string,usage:{costUsd:number;reported:boolean}):Promise<void>{await modelSettlementStatement(db,id,token,usage).run();const saved=await db.prepare('SELECT token,cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(id).first<{token:string;cost_usd:number;reported:number}>();if(saved?.token!==token)throw new ModelSpendingWait('RESERVATION_OWNER_MISMATCH');if(usage.reported&&(saved.reported!==1||saved.cost_usd!==usage.costUsd))throw Error('MODEL_SETTLEMENT_CONFLICT')}

/** Resolve only one explicitly authorized account; ambiguity is not permission.
 * Callers may bind an account explicitly when several provider accounts coexist. */
export async function modelSpendingAccount(db:D1Database,model:string,at:string,accountId?:string):Promise<string>{
 let rows:D1Result<{json:string}>;try{rows=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE valid_from<=? AND valid_until>?').bind(instant(at),instant(at)).all<{json:string}>()}catch(error){if(String(error).includes('no such table'))throw new ModelSpendingWait('ACCOUNT_LEDGER_MIGRATION_REQUIRED');throw error}
 const tracking=await trackingAccounts(db,model,accountId);
 const matching=rows.results.map(r=>JSON.parse(r.json) as ModelSpendingAuthorization).filter(g=>(!accountId||g.accountId===accountId)&&(g.modelIds.includes(model)||g.modelIds.includes('*')));
 if(!tracking.length&&matching.length!==1)throw new ModelSpendingWait('ACCOUNT_AUTHORIZATION_REQUIRED');
 const accounts=[...new Set([...tracking.map(r=>r.accountId),...matching.map(g=>g.accountId)])];if(accounts.length!==1)throw new ModelSpendingWait('ACCOUNT_AUTHORIZATION_REQUIRED');return accounts[0];
}
/** Explicit operator account mapping of immutable historical intent. Never
 * infer provider account from Feed, date, model name or missing metadata. */
export async function reconcileLegacyModelSpending(db:D1Database,kind:'semantic_intents'|'model_intents'|'salience_intents',id:string,accountId:string):Promise<void>{
 const row=await db.prepare('SELECT feed_id,json FROM v1_feed_documents WHERE kind=? AND id=?').bind(kind,id).first<{feed_id:string;json:string}>();if(!row||!accountId)throw Error('INVALID_LEGACY_MODEL_MAPPING');const intent=JSON.parse(row.json),key=kind+':'+id;
 const token=intent.token??('legacy:'+id),reservedCostUsd=intent.reservedCostUsd??intent.reservedCost;
 if(!Number.isFinite(reservedCostUsd)||reservedCostUsd<0)throw new ModelSpendingWait('LEGACY_COST_UNKNOWN');
 const read=async(k:string)=>{const x=await db.prepare('SELECT json FROM v1_feed_documents WHERE kind=? AND id=? AND feed_id=?').bind(k,id,row.feed_id).first<{json:string}>();return x?JSON.parse(x.json):undefined};
 const result=kind==='semantic_intents'?(await read('semantic_settlements')??await read('semantic_results')):kind==='model_intents'?await read('model_executions'):await read('salience_results');
 const usage=kind==='model_intents'?{costUsd:result?.cost,reported:result?.confirmed}:kind==='salience_intents'?result?.result?.usage:result?.usage;
 if(usage?.reported&&(!Number.isFinite(usage.costUsd)||usage.costUsd<0))throw new ModelSpendingWait('LEGACY_COST_UNKNOWN');
 const r:ModelSpendingReservation={id:key,accountId,model:intent.input?.model??intent.model??'LEGACY_UNKNOWN_MODEL',feedId:row.feed_id,token,reservedCostUsd,leaseUntil:typeof intent.leaseUntil==='number'?intent.leaseUntil:0,createdAt:intent.createdAt};
 if(!Number.isFinite(Date.parse(r.createdAt)))throw new ModelSpendingWait('LEGACY_TIME_UNKNOWN');
 const prior=await db.prepare('SELECT json FROM v1_model_spending_reservations WHERE id=?').bind(key).first<{json:string}>();if(prior&&canonicalJson(JSON.parse(prior.json))!==canonicalJson(r))throw Error('LEGACY_ACCOUNT_MAPPING_CONFLICT');
 await db.prepare('INSERT INTO v1_model_spending_reservations VALUES(?,?,NULL,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(key,r.accountId,r.token,r.model,r.feedId,r.reservedCostUsd,r.leaseUntil,instant(r.createdAt),JSON.stringify(r)).run();

 if(usage&&Number.isFinite(usage.costUsd)&&usage.costUsd>=0)await settleModelSpending(db,key,token,{costUsd:usage.costUsd,reported:Boolean(usage.reported)});
}

/** Read-only explanation of the existing admission rule. Local ownership and
 * unresolved billing cannot establish a remote execution lifetime. No release,
 * provider lookup, settlement or semantic mutation is performed here. */
export function executionCapacityDiagnostic(input:{accountMapped:boolean;reported?:boolean;leaseUntil?:number;calls?:number;providerDiagnostic?:ProviderDiagnostic;quarantine?:{approvalId:string;approvedBy:string}},now=Date.now()){
 const unpaid=!input.accountMapped&&input.calls===0,d=input.providerDiagnostic;
 const rejection=d?.httpStatus===400&&d.code==='invalid_json_schema'&&d.category==='invalid_request_error'&&d.execution==='REJECTED_BEFORE_EXECUTION'&&Boolean(d.requestId);
 return {
  localLeaseState:typeof input.leaseUntil==='number'?input.leaseUntil>now?'LIVE':'EXPIRED':'NOT_OBSERVABLE',
  countedAgainstConcurrency:input.accountMapped?!input.reported&&!input.quarantine:unpaid?false:null,
  quarantine:input.quarantine?{...input.quarantine,riskAcceptance:'REMOTE_TERMINATION_UNPROVEN'}:null,
  remoteExecutionState:unpaid?'NOT_RUN':rejection?'CONFIRMED_NONEXECUTION':'TERMINATION_UNPROVEN',
  capacityReleaseEligibility:input.quarantine?'OPERATOR_QUARANTINED_WITH_UNPROVEN_TERMINATION':!input.accountMapped?unpaid?'NOT_APPLICABLE':'NOT_OBSERVABLE':input.reported?'ALREADY_RELEASED_BY_SETTLEMENT':rejection?'EVIDENCE_BOUND_RECONCILIATION_REQUIRED':'INSUFFICIENT_PROVIDER_EVIDENCE',
  recoveryReason:input.quarantine?'Explicit operator risk acceptance removed this identity from new admission; financial exposure and UNKNOWN fences remain. Remote termination is unproven.':unpaid?'No paid operation was admitted.':input.accountMapped&&input.reported?'Confirmed accounting released the slot; inspect canonical semantic outcome independently.':rejection?'Explicit retained rejection supports the existing evidence-bound operator reconciliation.':'Obtain independently bound provider completion/rejection evidence. Lease expiry, timeout, cancellation and elapsed time are insufficient.'
 };
}
