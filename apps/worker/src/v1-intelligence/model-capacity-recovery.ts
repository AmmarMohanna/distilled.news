import type {Env} from '../types';

/** Opt-in deployment policy, not evidence of remote completion. Never settle
 * money, resend a call, or change a frozen input. Exact expired identities are
 * parked with their financial exposure and execution fences intact. */
export async function isolateExpiredModelExecutions(db:D1Database,policy:Env['V1_MODEL_UNCERTAIN_EXECUTION_POLICY'],now=new Date()):Promise<number>{
 if(policy===undefined)return 0;
 if(policy!=='isolate-after-5m-v1')throw Error('INVALID_UNCERTAIN_EXECUTION_POLICY');
 const at=now.getTime();if(!Number.isFinite(at))throw Error('INVALID_RECOVERY_TIME');
 const active=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='v1_model_active_operations'").first();
 const cutoff=at-300_000;
 const rows=await db.prepare(active?'SELECT id,account_id,feed_id,token,lease_until FROM v1_model_active_operations WHERE lease_until<=? ORDER BY lease_until,id LIMIT 3':`SELECT r.id,r.account_id,r.feed_id,r.token,r.lease_until FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.lease_until<=? AND COALESCE(s.reported,0)=0 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents q WHERE q.kind='model_execution_quarantines' AND q.id=r.id AND q.feed_id=r.feed_id AND json_extract(q.json,'$.accountId')=r.account_id AND json_extract(q.json,'$.reservationToken')=r.token) ORDER BY r.lease_until,r.id LIMIT 3`).bind(cutoff).all<{id:string;account_id:string;feed_id:string;token:string;lease_until:number}>();
 let count=0;
 for(const row of rows.results){
  const record={id:row.id,accountId:row.account_id,reservationToken:row.token,approvalId:'deployment-policy:'+policy,approvedBy:'deployment-operator',policy,createdAt:now.toISOString(),leaseUntil:row.lease_until,acceptUnprovenRemoteOverlap:true,remoteExecutionState:'TERMINATION_UNPROVEN',financialExposureRetained:true};
  const result=await db.prepare(`INSERT INTO v1_feed_documents(kind,id,feed_id,json)
   SELECT 'model_execution_quarantines',?,?,? WHERE EXISTS (
    SELECT 1 FROM ${active?'v1_model_active_operations a JOIN v1_model_spending_reservations r ON r.id=a.id':'v1_model_spending_reservations a JOIN v1_model_spending_reservations r ON r.id=a.id'}
    LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
    WHERE a.id=? AND a.account_id=? AND a.feed_id=? AND a.token=? AND a.lease_until<=?
    AND r.account_id=a.account_id AND r.feed_id=a.feed_id AND r.token=a.token AND COALESCE(s.reported,0)=0
   ) ON CONFLICT(kind,id) DO NOTHING`).bind(row.id,row.feed_id,JSON.stringify(record),row.id,row.account_id,row.feed_id,row.token,cutoff).run();
  if(result.meta.changes){count++;console.warn(JSON.stringify({type:'MODEL_EXECUTION_ISOLATED',reservationId:row.id,feedId:row.feed_id,policy,financialExposureRetained:true,remoteExecutionState:'TERMINATION_UNPROVEN'}))}
 }
 return count;
}
