import {CLAIM_EXTRACTOR,nonFactRole,type SourceDocument} from './claims';
import {targets,type PublicationWindow} from './scoring';
import {scheduleRematch,nextRematch,type RematchAttempt,type RematchRequest} from './rematch';
import {FeedTransaction,type V1FeedStore} from './store';
import type {EditorialWork} from './editorial-work';
import {evaluateEditorialDelta} from './editorial';
import {cheapEditorialRanking,compareEditorialCandidates} from './editorial-ranking';
/** Bounded policy rollout through the ordinary rematch queue. No new evidence,
 * source fetch, synthetic edition or special API. Existing model fences/budgets apply. */
const UPGRADE_POLICY=`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`,MAX_UPGRADES_PER_RUN=2;
/** One eligibility definition shared by detection and scheduling, so detection can never report work the
 * scheduler will skip (and the relay can never spin on it). A revision is eligible when its fact-bearing title
 * has no current-extractor document and no upgrade request. Events outside the publication window stay
 * eligible (a policy upgrade must not be defeated by age) but are only admitted behind in-window/pending-work
 * Events and only while fewer than MAX_UPGRADES_PER_RUN upgrade requests are still outstanding, so a large
 * retained corpus drains gradually through the ordinary rematch queue instead of being queued at once. */
async function upgradePlan(tx:FeedTransaction,window:PublicationWindow){
 const documents=await tx.list<SourceDocument>('source_documents'),work=await tx.list<EditorialWork>('editorial_deferred_work'),resolved=new Set((await tx.list<{id:string;workId:string}>('editorial_work_resolutions')).map(r=>r.workId));
 const pending=work.filter(w=>!resolved.has(w.id)),requests=await tx.list<RematchRequest>('rematch_requests'),attempts=await tx.list<RematchAttempt>('rematch_attempts');
 const extracted=new Set(documents.filter(d=>d.extractorVersion===CLAIM_EXTRACTOR).map(d=>d.evidenceRevisionId)),requested=new Set(requests.filter(r=>r.policyVersion===UPGRADE_POLICY).map(r=>r.evidenceRevisionId));
 // An upgrade request still retriable at any future time (budget wait, deferred, unknown outcome) is outstanding.
 const outstanding=requests.filter(r=>r.policyVersion===UPGRADE_POLICY&&nextRematch(r,attempts,'9999-12-31T00:00:00Z')!==undefined).length;
 const eligible=[];
 for(const target of await targets(tx,window,true)){
  const revisions=target.evidence.filter(e=>e.title&&!nonFactRole(e.title)&&!extracted.has(e.id)&&!requested.has(e.id));
  if(revisions.length)eligible.push({target,revisions,historical:Date.parse(target.updatedAt)<Date.parse(window.start)&&!pending.some(w=>w.stableTargetId===target.stableId)});
 }
 return {eligible,historicalCapacity:Math.max(0,MAX_UPGRADES_PER_RUN-outstanding)};
}
/** Cheap necessary condition only; upgradePlan decides what is actually schedulable. */
async function mayHaveExtractionUpgrade(store:V1FeedStore,feedId:string):Promise<boolean>{
 const row=await store.db.prepare(`SELECT 1 AS present FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL AND length(trim(COALESCE(json_extract(r.json,'$.title'),'')))>0 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=s.feed_id AND d.kind='source_documents' AND json_extract(d.json,'$.evidenceRevisionId')=r.id AND json_extract(d.json,'$.extractorVersion')=?) AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=s.feed_id AND d.kind='rematch_requests' AND json_extract(d.json,'$.evidenceRevisionId')=r.id AND json_extract(d.json,'$.policyVersion')=?) LIMIT 1`).bind(feedId,CLAIM_EXTRACTOR,`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`).first();return Boolean(row);
}
export async function hasUnscheduledExtractionUpgrade(store:V1FeedStore,feedId:string,window:PublicationWindow):Promise<boolean>{
 if(!await mayHaveExtractionUpgrade(store,feedId))return false;
 const {eligible,historicalCapacity}=await upgradePlan(new FeedTransaction(store,await store.snapshot(feedId)),window);
 return eligible.some(e=>!e.historical)||historicalCapacity>0&&eligible.length>0;
}
export async function scheduleExtractionUpgrades(tx:FeedTransaction,window:PublicationWindow,now:string){
 const {eligible,historicalCapacity}=await upgradePlan(tx,window),ordered=[];
 for(const {target,historical} of eligible){
  const editorial=await evaluateEditorialDelta(tx,target,window.end,window.start),facts=target.evidence.flatMap(e=>[e.title,e.body].filter((s):s is string=>Boolean(s)&&!nonFactRole(s!)).map(text=>({id:e.id,text,evidenceRevisionIds:[e.id],claimMentionIds:[]}))),ranking=cheapEditorialRanking(tx.snapshot.feed,{facts,sourceTitles:target.evidence.map(e=>e.title).filter((s):s is string=>Boolean(s)),flags:editorial.reasonCodes.includes('OLD_RECAP')?['OLD_RECAP']:[],effects:[],protectedReasons:[],fallbackEditorial:editorial});
  ordered.push({target,ranking,priority:ranking.score,protectedReasons:[],historical});
 }
 // Current-window and pending-work Events first; historical Events only fill the remaining bounded capacity.
 ordered.sort((a,b)=>Number(a.historical)-Number(b.historical)||compareEditorialCandidates(a,b));
 const scheduledRevisions=new Set<string>();let scheduled=0,historicalScheduled=0;
 for(const {target,historical} of ordered){
  for(const revision of eligible.find(e=>e.target===target)!.revisions){
   if(scheduled>=MAX_UPGRADES_PER_RUN||historical&&historicalScheduled>=historicalCapacity)return;
   if(scheduledRevisions.has(revision.id))continue;
   await scheduleRematch(tx,JSON.stringify(['REASSESS',revision.sourceObservationId,'']),revision.id,now,UPGRADE_POLICY);scheduledRevisions.add(revision.id);scheduled++;if(historical)historicalScheduled++;
  }
 }
}
