import {feedTransact,type V1FeedStore} from './store';
import type {BriefingRequest} from './runtime';
import type {PublicationWindow} from './scoring';

export const V3_CATCHUP_GRACE_MS=15*60000;
export const V3_CATCHUP_LIMIT=50;
export const V3_CATCHUP_REASON='SUPERSEDED_BY_LATER_WINDOW';

/** Record missed intervals, without expanding them or pretending they were
 * observed earlier. Bound each pass before admitting any catch-up inference. */
export async function materializeV3Catchup(store:V1FeedStore,feedId:string,windows:PublicationWindow[],now:string,identity:(window:PublicationWindow)=>Promise<string>):Promise<void>{
 if(windows.length>V3_CATCHUP_LIMIT)throw Error('CATCHUP_BATCH_TOO_LARGE');
 if(!Number.isFinite(Date.parse(now))||windows.some((w,i)=>!Number.isFinite(Date.parse(w.start))||!Number.isFinite(Date.parse(w.end))||Date.parse(w.start)>=Date.parse(w.end)||Date.parse(w.end)>Date.parse(now)||i>0&&Date.parse(w.start)!==Date.parse(windows[i-1].end)))throw Error('INVALID_CATCHUP_WINDOWS');
 const entries=await Promise.all(windows.map(async window=>({window,id:await identity(window)})));
 await feedTransact(store,feedId,async tx=>{
  await tx.preloadMany([{kind:'briefing_requests',ids:entries.map(e=>e.id)},{kind:'editions',ids:entries.map(e=>e.id)}]);
  for(const {id,window}of entries){
   if(await tx.read('briefing_requests',id)||await tx.read('editions',id))continue;
   await tx.write('briefing_requests',id,{id,feedId,window,engine:'v3',state:'PENDING',attempts:0,createdAt:now} satisfies BriefingRequest);
  }
 });
}

/** Retain old work as DEFERRED, not published/quiet. The existing unresolved
 * window lookup continues to expose its evidence to the newest V3 input.
 * Every decision is fenced by the same feed epoch as model intent admission. */
export async function supersedeUnstartedV3Windows(store:V1FeedStore,feedId:string,targetId:string,now:string,automatic:(window:PublicationWindow)=>boolean):Promise<string[]>{
 if(!Number.isFinite(Date.parse(now)))throw Error('INVALID_CATCHUP_TIME');
 return feedTransact(store,feedId,async tx=>{
  const target=await tx.read<BriefingRequest>('briefing_requests',targetId);
  if(!target||target.engine!=='v3'||target.state!=='PENDING'||target.v3InputId||target.blocked||['SEMANTIC_OUTCOME_UNKNOWN','V3_FROZEN_EVIDENCE_SUPERSEDED'].includes(target.reason??'')||!automatic(target.window)||Date.parse(target.window.end)>Date.parse(now))return [];
  if(!await store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='v3_catchup_model_fence'").first())throw Error('V3_CATCHUP_MIGRATION_REQUIRED');
  // A V3 preparation callback can be running before its first paid intent.
  // It owns a feed-wide semantic lease; never invalidate its input underneath it.
  const active=await store.db.prepare(`SELECT 1 FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=?
   AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r
    WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')) LIMIT 1`).bind(feedId,Date.now()).first();
  if(active)return [];
  const frozen=await store.db.prepare(`SELECT 1 WHERE EXISTS(SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind IN ('v3_window_inputs','v3_window_results','synthesis_jobs','editions') AND id=?)
   OR EXISTS(SELECT 1 FROM v1_feed_documents WHERE feed_id=? AND kind='semantic_intents' AND json_extract(json,'$.input.budgetKey')=?)`).bind(feedId,targetId,feedId,`v3:${targetId}`).first();
  if(frozen)return [];
  const rows=await store.db.prepare(`SELECT r.id FROM v1_feed_documents r
   WHERE r.feed_id=? AND r.kind='briefing_requests' AND json_extract(r.json,'$.state')='PENDING'
   AND json_extract(r.json,'$.engine')='v3' AND json_extract(r.json,'$.window.end')<?
   AND json_extract(r.json,'$.window.kind') IN ('30M','HOURLY','DAILY')
   AND julianday(COALESCE(json_extract(r.json,'$.window.scheduledFor'),json_extract(r.json,'$.window.end')))<=julianday(?)
   AND COALESCE(json_extract(r.json,'$.reason'),'') NOT IN ('SEMANTIC_OUTCOME_UNKNOWN','V3_FROZEN_EVIDENCE_SUPERSEDED')
   AND json_extract(r.json,'$.blocked') IS NULL
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=r.feed_id AND d.kind IN ('synthesis_jobs','editions','v3_window_results') AND (d.id=r.id OR d.id=json_extract(r.json,'$.v3InputId')))
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents i WHERE i.feed_id=r.feed_id AND i.kind='semantic_intents'
    AND json_extract(i.json,'$.input.budgetKey') IN ('v3:'||r.id,'editorial:'||json_extract(r.json,'$.window.start')||':'||json_extract(r.json,'$.window.end')))
   AND NOT EXISTS(SELECT 1 FROM v1_feed_documents p WHERE p.feed_id=r.feed_id AND p.kind='editorial_plans'
    AND json_extract(p.json,'$.window.start')=json_extract(r.json,'$.window.start') AND json_extract(p.json,'$.window.end')=json_extract(r.json,'$.window.end'))
   ORDER BY json_extract(r.json,'$.window.end'),r.id LIMIT ?`).bind(feedId,target.window.end,new Date(Date.parse(now)-V3_CATCHUP_GRACE_MS).toISOString(),V3_CATCHUP_LIMIT).all<{id:string}>();
  await tx.preload('briefing_requests',rows.results.map(r=>r.id));
  const settled:string[]=[];
  for(const {id}of rows.results){
   const current=await tx.read<BriefingRequest>('briefing_requests',id);
   if(!current||current.state!=='PENDING'||current.engine!=='v3'||!automatic(current.window))continue;
   await tx.write('briefing_requests',id,{...current,state:'DONE',result:'DEFERRED',reason:V3_CATCHUP_REASON,completedAt:now,nextAttemptAt:undefined,
    catchup:{policy:'v3-unstarted-backlog-v1',supersededBy:targetId,at:now}} satisfies BriefingRequest);
   settled.push(id);
  }
  return settled;
 });
}
