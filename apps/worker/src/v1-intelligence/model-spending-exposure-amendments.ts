import {canonicalJson} from '../v1-intake/canonical';
import type {ModelSpendingAuthorization} from './model-spending';

export interface ModelExposureApproval {id:string;authorizationId:string;accountId:string;expectedSequence:number;expectedMaxExposureUsd:number;maxExposureUsd:number;approvedBy:string;approvalId:string;createdAt:string}
export interface ModelExposureAmendment {id:string;authorizationId:string;accountId:string;sequence:number;previousMaxExposureUsd:number;maxExposureUsd:number;approvedBy:string;approvalId:string;createdAt:string}
const missingSchema=(error:unknown)=>String(error).includes('no such table: v1_model_spending_exposure_amendments');

/** Missing additive schema retains the immutable base cap. No money is released. */
export async function effectiveModelExposure(db:D1Database,authorizationId:string,accountId:string,baseLimit:number){
 try {
  const row=await db.prepare('SELECT sequence,max_exposure_usd FROM v1_model_spending_exposure_amendments WHERE authorization_id=? AND account_id=? ORDER BY sequence DESC LIMIT 1').bind(authorizationId,accountId).first<{sequence:number;max_exposure_usd:number}>();
  return {maxExposureUsd:row?.max_exposure_usd??baseLimit,exposureRevision:row?.sequence??0,exposureSchemaAvailable:true};
 }catch(error){if(missingSchema(error))return {maxExposureUsd:baseLimit,exposureRevision:0,exposureSchemaAvailable:false};throw error}
}

/** Trusted operator primitive. One INSERT..SELECT compares the exact immutable
 * grant and expected parent revision/cap atomically; the DDL independently guards
 * scope, sequence, monotonicity and immutability for direct operator SQL too.
 * No public route, automatic top-up, new grant period or liability reset. */
export async function amendModelExposure(db:D1Database,approval:ModelExposureApproval):Promise<ModelExposureAmendment>{
 if(!approval.id?.trim()||!approval.authorizationId?.trim()||!approval.accountId?.trim()||!approval.approvedBy?.trim()||!approval.approvalId?.trim()||!Number.isSafeInteger(approval.expectedSequence)||approval.expectedSequence<0||![approval.expectedMaxExposureUsd,approval.maxExposureUsd].every(x=>Number.isFinite(x)&&x>0)||approval.maxExposureUsd<=approval.expectedMaxExposureUsd||!Number.isFinite(Date.parse(approval.createdAt))||Date.parse(approval.createdAt)>Date.now())throw Error('INVALID_EXPOSURE_APPROVAL');
 const row=await db.prepare('SELECT account_id,json FROM v1_model_spending_authorizations WHERE id=?').bind(approval.authorizationId).first<{account_id:string;json:string}>();
 if(!row)throw Error('ACCOUNT_AUTHORIZATION_REQUIRED');
 const grant=JSON.parse(row.json) as ModelSpendingAuthorization;
 if(row.account_id!==approval.accountId||grant.accountId!==approval.accountId||grant.id!==approval.authorizationId)throw Error('EXPOSURE_APPROVAL_SCOPE_MISMATCH');
 if(Date.parse(approval.createdAt)<Date.parse(grant.validFrom)||Date.parse(approval.createdAt)>=Date.parse(grant.validUntil))throw Error('EXPOSURE_APPROVAL_OUTSIDE_GRANT');
 const value:ModelExposureAmendment={id:approval.id,authorizationId:grant.id,accountId:grant.accountId,sequence:approval.expectedSequence+1,previousMaxExposureUsd:approval.expectedMaxExposureUsd,maxExposureUsd:approval.maxExposureUsd,approvedBy:approval.approvedBy,approvalId:approval.approvalId,createdAt:new Date(approval.createdAt).toISOString()};
 const readPrior=()=>db.prepare('SELECT json FROM v1_model_spending_exposure_amendments WHERE id=?').bind(value.id).first<{json:string}>();
 const replay=(prior:{json:string})=>{const saved=JSON.parse(prior.json) as ModelExposureAmendment;if(canonicalJson(saved)!==canonicalJson(value))throw Error('EXPOSURE_AMENDMENT_IDENTITY_CONFLICT');return saved};
 try {
  const prior=await readPrior();if(prior)return replay(prior);
  const inserted=await db.prepare(`INSERT INTO v1_model_spending_exposure_amendments(id,authorization_id,account_id,sequence,previous_max_exposure_usd,max_exposure_usd,created_at,json)
   SELECT ?,a.id,a.account_id,?,?,?,?,? FROM v1_model_spending_authorizations a
   WHERE a.id=? AND a.account_id=? AND a.json=?
   AND COALESCE((SELECT MAX(sequence) FROM v1_model_spending_exposure_amendments WHERE authorization_id=a.id),0)=?
   AND COALESCE((SELECT max_exposure_usd FROM v1_model_spending_exposure_amendments WHERE authorization_id=a.id ORDER BY sequence DESC LIMIT 1),json_extract(a.json,'$.maxExposureUsd'))=? RETURNING json`)
   .bind(value.id,value.sequence,value.previousMaxExposureUsd,value.maxExposureUsd,value.createdAt,JSON.stringify(value),grant.id,grant.accountId,row.json,approval.expectedSequence,approval.expectedMaxExposureUsd).first<{json:string}>();
  if(inserted)return replay(inserted);
  const concurrent=await readPrior();if(concurrent)return replay(concurrent);
  throw Error('EXPOSURE_AMENDMENT_STALE');
 }catch(error){if(missingSchema(error))throw Error('EXPOSURE_AMENDMENT_MIGRATION_REQUIRED');throw error}
}
