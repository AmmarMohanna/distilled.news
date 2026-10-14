import {HandoffError} from '@distilled/contracts';
import type {Env,DistilledQueueMessage} from './types';
const LEASE_MS=120000;
export class IntelligenceTurnBusy extends Error {constructor(){super('INTELLIGENCE_TURN_BUSY')}}
export function isIntelligenceTurn(body:DistilledQueueMessage):boolean{return ['v1_reassess','v1_rematch','v1_briefing'].includes(body.type??'')}

/** Admission isolates unrelated feeds while avoiding competing reviews of one
 * Feed. It grants no evidence/model authority and never replaces canonical CAS.
 * A busy delivery can be acknowledged: its durable job/request stays pending
 * and the existing bounded relay rediscovers it without spending an attempt. */
export async function withIntelligenceTurn<T>(env:Env,body:DistilledQueueMessage,run:()=>Promise<T>):Promise<T>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!isIntelligenceTurn(body))return run();
 let feedId='feedId' in body?String(body.feedId):undefined;
 if('jobId' in body){const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();feedId=row?.feed_id;}
 if(!feedId)throw new HandoffError('SCOPE_DENIED');
 const token=crypto.randomUUID(),at=Date.now();
 const claim=await env.DB.prepare(`INSERT INTO connector_intelligence_turns(feed_id,token,lease_until) VALUES(?,?,?) ON CONFLICT(feed_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=? RETURNING feed_id`).bind(feedId,token,at+LEASE_MS,at).first();
 if(!claim)throw new IntelligenceTurnBusy();
 let lost=false,renewing:Promise<void>|undefined;
 const timer=setInterval(()=>{if(lost||renewing)return;renewing=(async()=>{try{const row=await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=? WHERE feed_id=? AND token=? AND lease_until>? RETURNING feed_id').bind(Date.now()+LEASE_MS,feedId,token,Date.now()).first();if(!row)lost=true;}catch{lost=true;}})().finally(()=>{renewing=undefined});},LEASE_MS/3);
 try{const result=await run();if(renewing)await renewing;if(lost)throw new HandoffError('TEMPORARY_UNAVAILABLE');return result;}
 finally{clearInterval(timer);if(renewing)await renewing;await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id=? AND token=?').bind(feedId,token).run();}
}
