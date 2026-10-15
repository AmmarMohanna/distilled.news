import {AsyncLocalStorage} from 'node:async_hooks';
import {HandoffError} from '@distilled/contracts';
import type {Env,DistilledQueueMessage} from './types';
const LEASE_MS=120000;
export class IntelligenceTurnBusy extends Error {constructor(){super('INTELLIGENCE_TURN_BUSY')}}
export class IntelligenceTurnLost extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
interface IntelligenceTurn {db:D1Database;feedId:string;token:string}
const intelligenceTurns=new AsyncLocalStorage<IntelligenceTurn>();
/** Canonical stores inherit admission through nested async work. Receipt/billing
 * settlement uses its immutable intent token and deliberately bypasses this guard. */
export function intelligenceTurnGuard(db:D1Database,feedId:string):{sql:string;args:string[]} {
 const turn=intelligenceTurns.getStore();
 if(!turn)return {sql:'',args:[]};
 if(turn.db!==db||turn.feedId!==feedId)throw new IntelligenceTurnLost();
 return {sql:" AND EXISTS(SELECT 1 FROM connector_intelligence_turns WHERE feed_id=? AND token=? AND lease_until>((julianday('now')-2440587.5)*86400000))",args:[feedId,turn.token]};
}
export async function assertIntelligenceTurn(db:D1Database,feedId:string):Promise<void>{
 const guard=intelligenceTurnGuard(db,feedId);if(!guard.sql)return;
 if(!await db.prepare('SELECT 1 WHERE 1'+guard.sql).bind(...guard.args).first())throw new IntelligenceTurnLost();
}
export function isIntelligenceTurn(body:DistilledQueueMessage):boolean{return ['v1_acquisition','v1_reassess','v1_rematch','v1_briefing'].includes(body.type??'')}

/** Admission isolates unrelated feeds while avoiding competing reviews of one
 * Feed. It grants no evidence/model authority and never replaces canonical CAS.
 * Busy deliveries retry with backoff; transport exhaustion leaves the durable
 * job/request discoverable without consuming a canonical processing attempt. */
export async function withIntelligenceTurn<T>(env:Env,body:DistilledQueueMessage,run:()=>Promise<T>):Promise<T>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!isIntelligenceTurn(body))return run();
 let feedId='feedId' in body?String(body.feedId):undefined;
 if('jobId' in body){const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();feedId=row?.feed_id;}
 if(!feedId)throw new HandoffError('SCOPE_DENIED');
 return withFeedWriteTurn(env,feedId,run);
}
/** Intake/acquisition and intelligence share the same canonical snapshot fence.
 * Upstream collection stays outside this turn; only its handoff takes admission.
 * Independent feeds remain concurrent. A nested same-feed operation inherits it. */
export async function withFeedWriteTurn<T>(env:Env,feedId:string,run:()=>Promise<T>):Promise<T>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')return run();
 const current=intelligenceTurns.getStore();
 if(current){if(current.db!==env.DB||current.feedId!==feedId)throw new IntelligenceTurnLost();await assertIntelligenceTurn(env.DB,feedId);return run();}
 const token=crypto.randomUUID(),at=Date.now();
 const claim=await env.DB.prepare(`INSERT INTO connector_intelligence_turns(feed_id,token,lease_until) VALUES(?,?,?) ON CONFLICT(feed_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=? RETURNING feed_id`).bind(feedId,token,at+LEASE_MS,at).first();
 if(!claim)throw new IntelligenceTurnBusy();
 let lost=false,renewing:Promise<void>|undefined;
 const timer=setInterval(()=>{if(lost||renewing)return;renewing=(async()=>{try{const row=await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=? WHERE feed_id=? AND token=? AND lease_until>? RETURNING feed_id').bind(Date.now()+LEASE_MS,feedId,token,Date.now()).first();if(!row)lost=true;}catch{lost=true;}})().finally(()=>{renewing=undefined});},LEASE_MS/3);
 try{return await intelligenceTurns.run({db:env.DB,feedId,token},async()=>{const result=await run();if(renewing)await renewing;if(lost)throw new IntelligenceTurnLost();await assertIntelligenceTurn(env.DB,feedId);return result;});}
 finally{clearInterval(timer);if(renewing)await renewing;await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id=? AND token=?').bind(feedId,token).run();}
}
