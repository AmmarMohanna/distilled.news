import type {Env} from './types';
/** Explicitly opted-in billed READ polling only. Unknown costs stay reserved;
 * the old operation remains a permanent no-replay tombstone. No actor starts. */
export async function recoverExpiredTwitterReads(env:Pick<Env,'DB'|'SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS'>,feedId:string,sourceId:string,now=new Date()){
 let feeds:unknown;try{feeds=JSON.parse(env.SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS??'[]')}catch{return 0}
 if(!Array.isArray(feeds)||!feeds.includes(feedId)||!Number.isFinite(now.getTime()))return 0;
 const cutoff=new Date(now.getTime()-15*60_000).toISOString();
 const rows=await env.DB.prepare(`SELECT o.operation_id,o.request_hash,o.ceiling_usd,o.headers,b.owner_account_id FROM connector_provider_operations o
 JOIN sources s ON s.id=o.feed_source_id AND s.briefing_id=o.feed_id JOIN briefings b ON b.id=s.briefing_id JOIN accounts a ON a.id=b.owner_account_id
 WHERE o.feed_id=? AND o.feed_source_id=? AND o.provider_id='x_twitterapi_io' AND o.status=-1 AND o.payload_ref IS NULL AND o.request_hash<>'' AND o.ceiling_usd>0
 AND s.enabled=1 AND b.paused=0 AND a.disabled_at IS NULL AND json_extract(o.headers,'$.acknowledgement') IS NULL
 AND julianday(COALESCE(json_extract(o.headers,'$.claimExpiresAt'),json_extract(o.headers,'$.failure.at')))<=julianday(?) LIMIT 5`).bind(feedId,sourceId,cutoff).all<{operation_id:string;request_hash:string;ceiling_usd:number;headers:string;owner_account_id:string}>();
 let count=0;
 for(const row of rows.results){
  const acknowledgement={kind:'UNKNOWN_OUTCOME_ACCEPTED_NO_REPLAY',requestHash:row.request_hash,reservedCeilingUsd:row.ceiling_usd,approvedBy:row.owner_account_id,approvalId:'automatic-fresh-x-read-v1',at:now.toISOString(),policy:'SOURCE_FRESH_X_POLL_RECOVERY_FEED_IDS',note:'Owner-authorized fresh polling after cooldown; outcome unknown, original reservation retained. Never replay this operation.'};
  const result=await env.DB.prepare(`UPDATE connector_provider_operations SET headers=json_set(headers,'$.acknowledgement',json(?)) WHERE provider_id='x_twitterapi_io' AND operation_id=? AND feed_id=? AND feed_source_id=? AND request_hash=? AND ceiling_usd=? AND status=-1 AND payload_ref IS NULL AND headers=? RETURNING operation_id`).bind(JSON.stringify(acknowledgement),row.operation_id,feedId,sourceId,row.request_hash,row.ceiling_usd,row.headers).first();
  if(result)count++;
 }
 return count;
}
