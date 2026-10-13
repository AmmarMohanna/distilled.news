import {sha256} from '@distilled/contracts';
import {modelSettlementStatement} from './model-spending';
import {canonicalJson} from '../v1-intake/canonical';
interface Approval {accountId:string;approvedBy:string;approvalId:string;evidenceHash:string}
export async function reviewModelRejection(db:D1Database,id:string,accountId:string){
 const reservation=await db.prepare('SELECT feed_id,account_id,token FROM v1_model_spending_reservations WHERE id=?').bind(id).first<{feed_id:string;account_id:string;token:string}>();
 if(!reservation||reservation.account_id!==accountId)throw Error('RECONCILIATION_ACCOUNT_MISMATCH');
 if(!id.startsWith('semantic_intents:'))throw Error('PROVIDER_NONEXECUTION_UNPROVEN');
 const operationId=id.slice('semantic_intents:'.length),row=await db.prepare("SELECT kind,json FROM v1_feed_documents WHERE feed_id=? AND id=? AND kind IN ('semantic_results','semantic_settlements') ORDER BY kind LIMIT 1").bind(reservation.feed_id,operationId).first<{kind:string;json:string}>();
 const receipt=row?JSON.parse(row.json):undefined,d=receipt?.providerDiagnostic;
 const eligible=receipt?.id===operationId&&d?.httpStatus===400&&d.code==='invalid_json_schema'&&d.category==='invalid_request_error'&&d.execution==='REJECTED_BEFORE_EXECUTION'&&Boolean(d.requestId);
 return {id,eligible,evidenceHash:row?await sha256(row.json):null,providerDiagnostic:d??null,reason:eligible?'CONFIRMED_SCHEMA_REJECTION':'PROVIDER_NONEXECUTION_UNPROVEN',reservation,row};
}
/** Existing platform-operator authorization is required by the caller. This
 * settles accounting only: the canonical failed/UNKNOWN operation stays fenced.
 * Status codes, expired leases and schema reconstructions are never evidence. */
export async function reconcileConfirmedModelRejection(db:D1Database,id:string,approval:Approval){
 if(!approval.approvedBy||!approval.approvalId||!approval.evidenceHash)throw Error('RECONCILIATION_APPROVAL_REQUIRED');
 const proof=await reviewModelRejection(db,id,approval.accountId);
 if(!proof.eligible||!proof.row)throw Error('PROVIDER_NONEXECUTION_UNPROVEN');
 if(approval.evidenceHash!==proof.evidenceHash)throw Error('RECONCILIATION_EVIDENCE_CHANGED');
 const auditId=id,audit={id:auditId,operationId:id,accountId:approval.accountId,approvedBy:approval.approvedBy,approvalId:approval.approvalId,evidenceHash:proof.evidenceHash,providerRequestId:proof.providerDiagnostic.requestId,outcome:'CONFIRMED_NONEXECUTION',settledCostUsd:0};
 const prior=await db.prepare("SELECT json FROM v1_feed_documents WHERE kind='model_spending_reconciliations' AND id=? AND feed_id=?").bind(auditId,proof.reservation.feed_id).first<{json:string}>();
 if(prior){if(canonicalJson(JSON.parse(prior.json))!==canonicalJson(audit))throw Error('RECONCILIATION_IDENTITY_CONFLICT');return audit}
 const settled=await db.prepare('SELECT cost_usd,reported FROM v1_model_spending_settlements WHERE id=?').bind(id).first<{cost_usd:number;reported:number}>();
 if(settled?.reported===1&&settled.cost_usd!==0)throw Error('MODEL_SETTLEMENT_CONFLICT');
 const guard=crypto.randomUUID();
 await db.batch([
  db.prepare(`INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind=? AND id=? AND feed_id=? AND json=?) AND EXISTS(SELECT 1 FROM v1_model_spending_reservations WHERE id=? AND account_id=? AND token=?) AND NOT EXISTS(SELECT 1 FROM v1_model_spending_settlements WHERE id=? AND reported=1 AND cost_usd!=0) THEN 1 ELSE 0 END`).bind(guard,proof.row.kind,id.slice('semantic_intents:'.length),proof.reservation.feed_id,proof.row.json,id,approval.accountId,proof.reservation.token,id),
  modelSettlementStatement(db,id,proof.reservation.token,{costUsd:0,reported:true}),
  db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('model_spending_reconciliations',?,?,?)").bind(auditId,proof.reservation.feed_id,JSON.stringify(audit)),
  db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)
 ]);
 return audit;
}
