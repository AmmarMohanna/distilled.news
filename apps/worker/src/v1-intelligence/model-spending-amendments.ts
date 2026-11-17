import {canonicalJson} from '../v1-intake/canonical';
import type {ModelSpendingAuthorization} from './model-spending';
interface ConcurrencyApproval {id:string;authorizationId:string;expectedConcurrentOperations:number;maxConcurrentOperations:number;approvedBy:string;approvalId:string;createdAt:string}
export async function effectiveModelConcurrency(db:D1Database,authorizationId:string,baseLimit:number){
 try {
  const row=await db.prepare('SELECT sequence,max_concurrent_operations FROM v1_model_spending_concurrency_amendments WHERE authorization_id=? ORDER BY sequence DESC LIMIT 1').bind(authorizationId).first<{sequence:number;max_concurrent_operations:number}>();
  return {maxConcurrentOperations:row?.max_concurrent_operations??baseLimit,concurrencyRevision:row?.sequence??0,concurrencySchemaAvailable:true};
 }catch(error){if(String(error).includes('no such table'))return {maxConcurrentOperations:baseLimit,concurrencyRevision:0,concurrencySchemaAvailable:false};throw error}
}
/** Trusted operator primitive: concurrency only. No paid identity, cost, expiry,
 * result or existing reservation is changed. Reversals require another amendment. */
export async function amendModelConcurrency(db:D1Database,approval:ConcurrencyApproval){
 if(!approval.id||!approval.authorizationId||!approval.approvedBy?.trim()||!approval.approvalId?.trim()||![approval.expectedConcurrentOperations,approval.maxConcurrentOperations].every(x=>Number.isSafeInteger(x)&&x>0)||!Number.isFinite(Date.parse(approval.createdAt))||Date.parse(approval.createdAt)>Date.now())throw Error('INVALID_CONCURRENCY_APPROVAL');
 const row=await db.prepare('SELECT json FROM v1_model_spending_authorizations WHERE id=?').bind(approval.authorizationId).first<{json:string}>();if(!row)throw Error('ACCOUNT_AUTHORIZATION_REQUIRED');
 const grant=JSON.parse(row.json) as ModelSpendingAuthorization;
 // Older binaries still enforce the immutable base. A below-base decrease needs
 // a separate drained-runtime transition, not this mixed-version amendment.
 if(approval.maxConcurrentOperations<grant.maxConcurrentOperations)throw Error('CONCURRENCY_DECREASE_BELOW_BASE_REQUIRES_DRAIN');
 if(Date.parse(approval.createdAt)<Date.parse(grant.validFrom)||Date.parse(approval.createdAt)>=Date.parse(grant.validUntil))throw Error('CONCURRENCY_APPROVAL_OUTSIDE_GRANT');
 const current=await effectiveModelConcurrency(db,grant.id,grant.maxConcurrentOperations);if(!current.concurrencySchemaAvailable)throw Error('CONCURRENCY_AMENDMENT_MIGRATION_REQUIRED');
 const prior=await db.prepare('SELECT json FROM v1_model_spending_concurrency_amendments WHERE id=?').bind(approval.id).first<{json:string}>();
 const fields={id:approval.id,authorizationId:grant.id,accountId:grant.accountId,previousMaxConcurrentOperations:approval.expectedConcurrentOperations,maxConcurrentOperations:approval.maxConcurrentOperations,approvedBy:approval.approvedBy,approvalId:approval.approvalId,createdAt:new Date(approval.createdAt).toISOString()};
 if(prior){const saved=JSON.parse(prior.json);if(canonicalJson(saved)!==canonicalJson({...fields,sequence:saved.sequence}))throw Error('CONCURRENCY_AMENDMENT_IDENTITY_CONFLICT');return saved}
 if(current.maxConcurrentOperations!==approval.expectedConcurrentOperations)throw Error('CONCURRENCY_AMENDMENT_STALE');
 const value={...fields,sequence:current.concurrencyRevision+1},guard=crypto.randomUUID();
 await db.batch([
  db.prepare('INSERT INTO v1_model_spending_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM v1_model_spending_authorizations WHERE id=? AND json=?) AND COALESCE((SELECT MAX(sequence) FROM v1_model_spending_concurrency_amendments WHERE authorization_id=?),0)=? THEN 1 ELSE 0 END').bind(guard,grant.id,row.json,grant.id,current.concurrencyRevision),
  db.prepare('INSERT INTO v1_model_spending_concurrency_amendments VALUES(?,?,?,?,?)').bind(value.id,grant.id,value.sequence,value.maxConcurrentOperations,JSON.stringify(value)),
  db.prepare('DELETE FROM v1_model_spending_guards WHERE id=?').bind(guard)
 ]);
 return value;
}
