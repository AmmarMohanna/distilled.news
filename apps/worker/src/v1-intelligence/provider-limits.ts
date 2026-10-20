import {ModelSpendingWait} from './model-spending';
export interface ProviderLimits {provider:'workers_ai'|'openrouter';maxConcurrent:number;requestsPerMinute:number}
/** Executed inside the SAME D1 batch as account admission and reservation insertion.
 * Includes legacy reservations conservatively; expiry never proves remote completion. */
export async function providerLimitStatements(db:D1Database,r:{id:string;model:string;createdAt:string;providerLimits?:ProviderLimits}):Promise<D1PreparedStatement[]>{
 const limits=r.providerLimits;if(!limits)return [];
 if(!['workers_ai','openrouter'].includes(limits.provider)||!Number.isSafeInteger(limits.maxConcurrent)||limits.maxConcurrent<1||limits.maxConcurrent>3||!Number.isSafeInteger(limits.requestsPerMinute)||limits.requestsPerMinute<1)throw Error('INVALID_PROVIDER_LIMITS');
 if((r.model.startsWith('workers_ai:')?'workers_ai':'openrouter')!==limits.provider)throw Error('PROVIDER_RESERVATION_IDENTITY_MISMATCH');
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_model_provider_guards'").first())throw new ModelSpendingWait('PROVIDER_LIMIT_MIGRATION_REQUIRED');
 const match=limits.provider==='workers_ai'?"p.model LIKE 'workers_ai:%'":"p.model NOT LIKE 'workers_ai:%'";
 const id=crypto.randomUUID(),since=new Date(Date.parse(r.createdAt)-60000).toISOString();
 return [db.prepare( 'INSERT INTO v1_model_provider_guards(id,valid) SELECT ?,CASE WHEN (SELECT COUNT(*) FROM v1_model_spending_reservations p LEFT JOIN v1_model_spending_settlements s ON s.id=p.id WHERE '+match+' AND COALESCE(s.reported,0)=0)<? AND (SELECT COUNT(*) FROM v1_model_spending_reservations p WHERE '+match+' AND p.created_at>=?)<? THEN 1 ELSE 0 END').bind(id,limits.maxConcurrent,since,limits.requestsPerMinute),db.prepare('DELETE FROM v1_model_provider_guards WHERE id=?').bind(id)];
}
