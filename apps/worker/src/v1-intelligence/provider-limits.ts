import {ModelSpendingWait} from './model-spending';
export interface ProviderLimits {provider:'cloudflare'|'workers_ai'|'openrouter';maxConcurrent:number;requestsPerMinute:number;maxConcurrentPerFeed?:number}
/** Executed inside the SAME D1 batch as account admission and reservation insertion.
 * Includes legacy reservations conservatively; expiry never proves remote completion. */
export async function providerLimitStatements(db:D1Database,r:{id:string;model:string;feedId:string;createdAt:string;providerLimits?:ProviderLimits},options?:{accountingSince:string}):Promise<D1PreparedStatement[]>{
 const limits=r.providerLimits;if(!limits)return [];
 if(!['cloudflare','workers_ai','openrouter'].includes(limits.provider)||!Number.isSafeInteger(limits.maxConcurrent)||limits.maxConcurrent<1||limits.maxConcurrent>6||!Number.isSafeInteger(limits.requestsPerMinute)||limits.requestsPerMinute<1)throw Error('INVALID_PROVIDER_LIMITS');
 if(limits.maxConcurrentPerFeed!==undefined&&(!Number.isSafeInteger(limits.maxConcurrentPerFeed)||limits.maxConcurrentPerFeed<1||limits.maxConcurrentPerFeed>limits.maxConcurrent))throw Error('INVALID_PROVIDER_LIMITS');
 if((r.model.startsWith('cloudflare:')?'cloudflare':r.model.startsWith('workers_ai:')?'workers_ai':'openrouter')!==limits.provider)throw Error('PROVIDER_RESERVATION_IDENTITY_MISMATCH');
 if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_model_provider_guards'").first())throw new ModelSpendingWait('PROVIDER_LIMIT_MIGRATION_REQUIRED');
 const match=limits.provider!=='openrouter'?"(p.model LIKE 'workers_ai:%' OR p.model LIKE 'cloudflare:%')":"p.model NOT LIKE 'workers_ai:%' AND p.model NOT LIKE 'cloudflare:%'";
 const transition=options?.accountingSince;if(transition&&!Number.isFinite(Date.parse(transition)))throw Error('INVALID_TRACKING_TRANSITION');
 const operational=transition?' AND (p.created_at>=? OR p.lease_until>?)':'';
 const id=crypto.randomUUID(),since=new Date(Date.parse(r.createdAt)-60000).toISOString();
 const active=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_model_active_operations'").first();
 if(active){
  const provider=limits.provider==='openrouter'?'openrouter':'cloudflare',operational=transition?' AND (created_at>=? OR lease_until>?)':'';
  const count='SELECT COUNT(*) FROM v1_model_active_operations WHERE provider=?'+operational;
  const bindings=()=>[provider,...(transition?[transition,Date.now()]:[])];
  const perFeed=limits.maxConcurrentPerFeed===undefined?'':` AND (${count} AND feed_id=?)<?`;
  return [db.prepare(`INSERT INTO v1_model_provider_guards(id,valid) SELECT ?,CASE WHEN (${count})<? ${perFeed} AND (SELECT COUNT(*) FROM v1_model_spending_reservations WHERE (CASE WHEN model LIKE 'cloudflare:%' OR model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END)=? AND created_at>=?)<? THEN 1 ELSE 0 END`).bind(id,...bindings(),limits.maxConcurrent,...(limits.maxConcurrentPerFeed===undefined?[]:[...bindings(),r.feedId,limits.maxConcurrentPerFeed]),provider,since,limits.requestsPerMinute),db.prepare('DELETE FROM v1_model_provider_guards WHERE id=?').bind(id)];
 }
 // Rolling upgrades retain the original safe ledger query until migration.
 const count='SELECT COUNT(*) FROM v1_model_spending_reservations p LEFT JOIN v1_model_spending_settlements s ON s.id=p.id WHERE '+match+' AND COALESCE(s.reported,0)=0 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents q WHERE q.kind=\'model_execution_quarantines\' AND q.id=p.id AND q.feed_id=p.feed_id AND json_extract(q.json,\'$.accountId\')=p.account_id AND json_extract(q.json,\'$.reservationToken\')=p.token)'+operational;
 const bindings=()=>transition?[transition,Date.now()]:[];
 const perFeed=limits.maxConcurrentPerFeed===undefined?'':` AND (${count} AND p.feed_id=?)<?`;
 return [db.prepare(`INSERT INTO v1_model_provider_guards(id,valid) SELECT ?,CASE WHEN (${count})<? ${perFeed} AND (SELECT COUNT(*) FROM v1_model_spending_reservations p WHERE ${match} AND p.created_at>=?)<? THEN 1 ELSE 0 END`).bind(id,...bindings(),limits.maxConcurrent,...(limits.maxConcurrentPerFeed===undefined?[]:[...bindings(),r.feedId,limits.maxConcurrentPerFeed]),since,limits.requestsPerMinute),db.prepare('DELETE FROM v1_model_provider_guards WHERE id=?').bind(id)];
}
