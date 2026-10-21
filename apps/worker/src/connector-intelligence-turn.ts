import {AsyncLocalStorage} from 'node:async_hooks';
import {HandoffError,sha256} from '@distilled/contracts';
import {canonicalJson} from './v1-intake/canonical';
import type {Env,DistilledQueueMessage} from './types';
import {countLatency,measureLatency,withLatency} from './v1-intelligence/latency';
const LEASE_MS=120000;
const WAITER_TTL_MS=300000,READY_MS=1000;
export class IntelligenceTurnBusy extends Error {constructor(){super('INTELLIGENCE_TURN_BUSY')}}
export class IntelligenceTurnLost extends HandoffError {constructor(){super('TEMPORARY_UNAVAILABLE')}}
interface IntelligenceTurn {db:D1Database;feedId:string;token:string}
const intelligenceTurns=new AsyncLocalStorage<IntelligenceTurn>();
const computationTurns=new AsyncLocalStorage<{env:Env;feedId:string}>();
/** Only the atomic store commit holds admission. Its original snapshot and
 * every scope epoch are still checked by CAS after admission is acquired. */
export function withCanonicalCommitTurn<T>(db:D1Database,feedId:string,run:()=>Promise<T>):Promise<T>{
 const computation=computationTurns.getStore();
 if(!computation)return run();
 if(computation.env.DB!==db||computation.feedId!==feedId)throw new IntelligenceTurnLost();
 return withFeedWriteTurn(computation.env,feedId,run,'publication-commit');
}
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
 * Busy deliveries rotate their fenced transport generation without consuming
 * a canonical processing attempt; Cron recovers actual lost sends/crashes. */
export async function withIntelligenceTurn<T>(env:Env,body:DistilledQueueMessage,run:()=>Promise<T>):Promise<T>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true'||!isIntelligenceTurn(body))return run();
 let feedId='feedId' in body?String(body.feedId):undefined;
 if('jobId' in body){const row=await env.DB.prepare('SELECT feed_id FROM v1_intake_scopes WHERE id=(SELECT feed_source_id FROM v1_jobs WHERE id=?)').bind(body.jobId).first<{feed_id:string}>();feedId=row?.feed_id;}
 if(!feedId)throw new HandoffError('SCOPE_DENIED');
 // Acquisition owns an observation lease. Network I/O and durable result
 // storage must not hold the Feed turn; only evidence promotion takes it.
 if(body.type==='v1_acquisition')return run();
 // Isolated preparation owns a durable work lease, not canonical graph admission.
 // Runtime reacquires this turn for deterministic consumption. Legacy default
 // retains the original ownership boundary until explicitly rolled out.
 if(env.V1_REVIEW_PREPARATION_ISOLATED==='true'&&(body.type==='v1_reassess'||body.type==='v1_rematch'))return run();
 // The runtime PUBLICATION measurement starts inside this turn, so it cannot
 // observe admission/hold time. A separate bounded outer record includes the
 // full exclusive callback without changing admission, renewal or fencing.
 if(body.type==='v1_briefing'){
  // Match runtime.windowIdentity for equivalent valid ISO representations;
  // malformed dates still follow the existing runtime validation path.
  const instant=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toISOString():value;
  const windowId=await sha256(canonicalJson({feedId,start:instant(body.window.start),end:instant(body.window.end)}));
  return withLatency({feedId,windowId,phase:'PUBLICATION_TURN'},()=>env.V1_PUBLICATION_PREPARATION_ISOLATED==='true'
   ?computationTurns.run({env,feedId:feedId!},run)
   :withFeedWriteTurn(env,feedId!,run,JSON.stringify(body)));
 }
 return withFeedWriteTurn(env,feedId,run,JSON.stringify(body));
}
/** Intake and intelligence share the same canonical snapshot fence.
 * Upstream collection/download stays outside this turn; handoff, acquisition
 * claim and evidence promotion take admission.
 * Independent feeds remain concurrent. A nested same-feed operation inherits it. */
export async function withFeedWriteTurn<T>(env:Env,feedId:string,run:()=>Promise<T>,workId='handoff'):Promise<T>{
 if(env.SOURCE_QUEUE_SCHEDULING_ENABLED!=='true')return run();
 const current=intelligenceTurns.getStore();
 if(current){if(current.db!==env.DB||current.feedId!==feedId)throw new IntelligenceTurnLost();await assertIntelligenceTurn(env.DB,feedId);return run();}
 const token=crypto.randomUUID(),at=Date.now();
 // FIFO applies among recently ready deliveries. A waiter whose message is
 // sleeping/backed off must not reserve an otherwise idle Feed. Retain its
 // original age for priority when it returns, rather than resetting its place.
 const offered=env.DB.prepare(`INSERT INTO connector_feed_turn_waiters(feed_id,work_id,queued_at,expires_at) VALUES(?,?,?,?)
 ON CONFLICT(feed_id,work_id) DO UPDATE SET queued_at=CASE WHEN expires_at<=? THEN excluded.queued_at ELSE queued_at END,expires_at=excluded.expires_at`).bind(feedId,workId,at,at+WAITER_TTL_MS,at);
 const claiming=env.DB.prepare(`INSERT INTO connector_intelligence_turns(feed_id,token,lease_until)
 SELECT ?,?,? WHERE (SELECT work_id FROM connector_feed_turn_waiters WHERE feed_id=? AND expires_at>? ORDER BY queued_at,work_id LIMIT 1)=?
 ON CONFLICT(feed_id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until WHERE lease_until<=? RETURNING feed_id`).bind(feedId,token,at+LEASE_MS,feedId,at+WAITER_TTL_MS-READY_MS,workId,at);
 const claim=(await measureLatency('FEED_TURN_ADMISSION',()=>env.DB.batch([offered,claiming])))[1].results[0];
 if(!claim){countLatency('feedTurnBusy');throw new IntelligenceTurnBusy();}
 let lost=false,renewing:Promise<void>|undefined;
 const timer=setInterval(()=>{if(lost||renewing)return;renewing=(async()=>{try{const row=await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=? WHERE feed_id=? AND token=? AND lease_until>? RETURNING feed_id').bind(Date.now()+LEASE_MS,feedId,token,Date.now()).first();if(!row)lost=true;}catch{lost=true;}})().finally(()=>{renewing=undefined});},LEASE_MS/3);
 try{await env.DB.prepare('DELETE FROM connector_feed_turn_waiters WHERE feed_id=? AND (work_id=? OR expires_at<=?)').bind(feedId,workId,at).run();return await measureLatency('FEED_TURN_HELD',()=>intelligenceTurns.run({db:env.DB,feedId,token},async()=>{const result=await run();if(renewing)await renewing;if(lost)throw new IntelligenceTurnLost();await assertIntelligenceTurn(env.DB,feedId);return result;}));}
 finally{clearInterval(timer);if(renewing)await renewing;await env.DB.prepare('UPDATE connector_intelligence_turns SET lease_until=0 WHERE feed_id=? AND token=?').bind(feedId,token).run();}
}
