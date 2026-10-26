import {unresolvedProviderOperationSql} from '@distilled/connectors';
/** Read-only admission before creating another polling window. The paid HTTP
 * transaction remains the final authority. Unknown charges are never refunded
 * or resubmitted merely because a later run/fallback has a different identity. */
export async function hasUncertainSourcePayment(db:D1Database,feedId:string,sourceId:string,providers:readonly string[]):Promise<boolean>{
 if(!providers.length)return false;
 return !!await db.prepare(`SELECT 1 AS blocked FROM connector_provider_operations WHERE ${unresolvedProviderOperationSql} AND
  ((feed_id=? AND feed_source_id=?) OR (feed_source_id IS NULL AND provider_id IN (${providers.map(()=>'?').join(',')}))) LIMIT 1`)
  .bind(feedId,sourceId,...providers).first();
}

/** Operator evidence inventory. Never return credential headers/claim tokens,
 * mutate reservations, or treat an absent receipt as proof of no charge. */
export async function inspectSourcePaymentHolds(db:D1Database,feedId:string){
 return (await db.prepare(`SELECT provider_id,operation_id,request_hash,ceiling_usd,status,feed_id,feed_source_id
  FROM connector_provider_operations WHERE ${unresolvedProviderOperationSql} AND (feed_id=? OR feed_source_id IS NULL)
  ORDER BY provider_id,operation_id LIMIT 200`).bind(feedId).all()).results;
}
