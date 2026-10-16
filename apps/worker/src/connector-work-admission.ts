import type {DistilledQueueMessage,Env} from './types';
const SLOT_LEASE_MS=120000;
/** Transport backpressure prevents a single Feed's backlog occupying every
 * consumer. Expiry is crash recovery, not canonical or financial authority. */
export async function reserveConnectorWork(env:Env,body:DistilledQueueMessage,token:string,now:number):Promise<boolean>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!['v1_acquisition','v1_reassess','v1_rematch','v1_briefing'].includes(body.type??''))return true;
 const feedId='feedId' in body?String(body.feedId):'jobId' in body?(await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>())?.feed_id:undefined;
 // Unknown/legacy work still reaches its canonical scope validator. Transport
 // must not silently discard it because its old job no longer exists.
 if(!feedId)return true;
 const acquisition=body.type==='v1_acquisition',lane=acquisition?'acquisition':'intelligence',slots=acquisition?4:1;
 const claim=await env.DB.prepare(`INSERT INTO connector_work_slots(feed_id,lane,slot,token,lease_until)
 SELECT ?,?,available.slot,?,? FROM (SELECT 0 slot UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3) available
 WHERE available.slot<? AND NOT EXISTS(SELECT 1 FROM connector_work_slots s WHERE s.feed_id=? AND s.lane=? AND s.slot=available.slot AND s.lease_until>?)
 ORDER BY available.slot LIMIT 1
 ON CONFLICT(feed_id,lane,slot) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=? RETURNING slot`).bind(feedId,lane,token,now+SLOT_LEASE_MS,slots,feedId,lane,now,now).first();
 return !!claim;
}
export async function releaseConnectorWork(env:Env,token:string):Promise<void>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true')await env.DB.prepare('UPDATE connector_work_slots SET lease_until=0 WHERE token=?').bind(token).run();
}
export async function renewConnectorWork(env:Env,token:string):Promise<void>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED==='true')await env.DB.prepare('UPDATE connector_work_slots SET lease_until=? WHERE token=? AND lease_until>?').bind(Date.now()+SLOT_LEASE_MS,token,Date.now()).run();
}
