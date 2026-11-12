import {feedTransact,type V1FeedStore} from './store';
import type {BriefingRequest} from './runtime';

/** Dispose only windows whose immutable paid input cannot produce a publishable
 * result. Their evidence remains eligible for a later window; no paid record,
 * source revision or request identity is changed. Active owners keep authority. */
export async function recoverBlockedV3Request(store:V1FeedStore,feedId:string,request:BriefingRequest,at:string):Promise<boolean>{
 if(request.engine!=='v3'||request.state!=='PENDING'||!['SEMANTIC_OUTCOME_UNKNOWN','V3_FROZEN_EVIDENCE_SUPERSEDED'].includes(request.reason??''))return false;
 if(!Number.isFinite(Date.parse(at)))throw Error('INVALID_RECOVERY_TIME');
 return feedTransact(store,feedId,async tx=>{
  const current=await tx.read<BriefingRequest>('briefing_requests',request.id);
  if(!current||current.state!=='PENDING'||current.reason!==request.reason||current.engine!=='v3'||await tx.read('editions',request.id))return false;
  const active=await store.db.prepare(`SELECT 1 FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.leaseUntil')>?
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')) LIMIT 1`).bind(feedId,Date.now()).first();
  if(active)return false;
  // Recovery needs identity metadata only, never the retained article bodies.
  const inputId=current.v3InputId??current.id;
  const frozen=await store.db.prepare("SELECT json_extract(json,'$.fingerprint') fingerprint FROM v1_feed_documents WHERE kind='v3_window_inputs' AND id=? AND feed_id=?").bind(inputId,feedId).first<{fingerprint:string}>();if(!frozen?.fingerprint)return false;
  const intent=await store.db.prepare(`SELECT i.id FROM v1_feed_documents i WHERE i.feed_id=? AND i.kind='semantic_intents'
   AND json_extract(i.json,'$.input.budgetKey')=? AND json_extract(i.json,'$.input.state.inputId')=? LIMIT 1`).bind(feedId,`v3:${current.id}`,frozen.fingerprint).first<{id:string}>();
  let reason:string;
  if(current.reason==='V3_FROZEN_EVIDENCE_SUPERSEDED'){
   if(!intent&&!await store.db.prepare("SELECT 1 FROM v1_feed_documents WHERE kind='v3_window_results' AND id=? AND feed_id=?").bind(inputId,feedId).first())return false;
   reason='V3_FROZEN_EVIDENCE_SUPERSEDED';
  }else{
   const isolated=await store.db.prepare(`SELECT i.id FROM v1_feed_documents i
    JOIN v1_model_spending_reservations r ON r.id='semantic_intents:'||i.id AND r.feed_id=i.feed_id
    JOIN v1_feed_documents q ON q.kind='model_execution_quarantines' AND q.id=r.id AND q.feed_id=r.feed_id
    AND json_extract(q.json,'$.accountId')=r.account_id AND json_extract(q.json,'$.reservationToken')=r.token
    WHERE i.feed_id=? AND i.kind='semantic_intents' AND json_extract(i.json,'$.input.budgetKey')=?
    AND json_extract(i.json,'$.input.state.inputId')=? LIMIT 1`).bind(feedId,`v3:${current.id}`,frozen.fingerprint).first();
   if(isolated)reason='V3_UNCERTAIN_CALL_ISOLATED';
   else{
    // Later accounting can settle the charge without recovering usable model
    // output. The immutable failed semantic result still cannot be published.
    const failed=await store.db.prepare(`SELECT i.id FROM v1_feed_documents i
     JOIN v1_model_spending_reservations r ON r.id='semantic_intents:'||i.id AND r.feed_id=i.feed_id AND r.token=json_extract(i.json,'$.token')
     JOIN v1_model_spending_settlements s ON s.id=r.id AND s.token=r.token AND s.reported=1
     JOIN v1_feed_documents result ON result.kind='semantic_results' AND result.id=i.id AND result.feed_id=i.feed_id
     WHERE i.feed_id=? AND i.kind='semantic_intents' AND json_extract(i.json,'$.input.budgetKey')=?
     AND json_extract(i.json,'$.input.state.inputId')=? AND json_extract(result.json,'$.input.state.inputId')=json_extract(i.json,'$.input.state.inputId')
     AND json_extract(result.json,'$.status')='DEFERRED' AND json_extract(result.json,'$.usage.calls')>0
     AND length(json_extract(result.json,'$.failure'))>0 LIMIT 1`).bind(feedId,`v3:${current.id}`,frozen.fingerprint).first();
    if(!failed)return false;
    reason='V3_SETTLED_CALL_FAILED';
   }
  }
  await tx.write('briefing_requests',current.id,{...current,state:'FAILED',failure:reason,reason,completedAt:at,nextAttemptAt:undefined});
  console.warn(JSON.stringify({type:'V3_BLOCKED_WINDOW_RETIRED',feedId,requestId:current.id,reason,evidenceCarriedForward:true,financialRecordsUnchanged:true}));
  return true;
 });
}
