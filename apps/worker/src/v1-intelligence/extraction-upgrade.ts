import {CLAIM_EXTRACTOR,nonFactRole,type SourceDocument} from './claims';
import {targets,type PublicationWindow} from './scoring';
import {scheduleRematch} from './rematch';
import type {FeedTransaction,V1FeedStore} from './store';
import type {EditorialWork} from './editorial-work';
import {evaluateEditorialDelta} from './editorial';
import {cheapEditorialRanking,compareEditorialCandidates} from './editorial-ranking';
/** Bounded policy rollout through the ordinary rematch queue. No new evidence,
 * source fetch, synthetic edition or special API. Existing model fences/budgets apply. */
export async function hasUnscheduledExtractionUpgrade(store:V1FeedStore,feedId:string):Promise<boolean>{
 const row=await store.db.prepare(`SELECT 1 AS present FROM v1_evidence e JOIN v1_intake_scopes s ON s.id=e.feed_source_id JOIN v1_revisions r ON r.id=json_extract(e.json,'$.currentRevisionId') WHERE s.feed_id=? AND json_extract(e.json,'$.state')='ACTIVE' AND json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL AND length(trim(COALESCE(json_extract(r.json,'$.title'),'')))>0 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=s.feed_id AND d.kind='source_documents' AND json_extract(d.json,'$.evidenceRevisionId')=r.id AND json_extract(d.json,'$.extractorVersion')=?) AND NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=s.feed_id AND d.kind='rematch_requests' AND json_extract(d.json,'$.evidenceRevisionId')=r.id AND json_extract(d.json,'$.policyVersion')=?) LIMIT 1`).bind(feedId,CLAIM_EXTRACTOR,`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`).first();return Boolean(row);
}
export async function scheduleExtractionUpgrades(tx:FeedTransaction,window:PublicationWindow,now:string){
 const documents=await tx.list<SourceDocument>('source_documents'),work=await tx.list<EditorialWork>('editorial_deferred_work'),resolved=new Set((await tx.list<{id:string;workId:string}>('editorial_work_resolutions')).map(r=>r.workId));
 const pending=work.filter(w=>!resolved.has(w.id)),requests=await tx.list<import('./rematch').RematchRequest>('rematch_requests'),scheduledRevisions=new Set<string>();let scheduled=0;
 const ordered=[];
 for(const target of await targets(tx,window,true)){
  if(Date.parse(target.updatedAt)<Date.parse(window.start)&&!pending.some(w=>w.stableTargetId===target.stableId))continue;
  if(!target.evidence.some(e=>e.title&&!nonFactRole(e.title)&&!documents.some(d=>d.evidenceRevisionId===e.id&&d.extractorVersion===CLAIM_EXTRACTOR)&&!requests.some(r=>r.evidenceRevisionId===e.id&&r.policyVersion===`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`)))continue;
  const editorial=await evaluateEditorialDelta(tx,target,window.end,window.start),facts=target.evidence.flatMap(e=>[e.title,e.body].filter((s):s is string=>Boolean(s)&&!nonFactRole(s!)).map(text=>({id:e.id,text,evidenceRevisionIds:[e.id],claimMentionIds:[]}))),ranking=cheapEditorialRanking(tx.snapshot.feed,{facts,sourceTitles:target.evidence.map(e=>e.title).filter((s):s is string=>Boolean(s)),flags:editorial.reasonCodes.includes('OLD_RECAP')?['OLD_RECAP']:[],effects:[],protectedReasons:[],fallbackEditorial:editorial});
  ordered.push({target,ranking,priority:ranking.score,protectedReasons:[]});
 }
 ordered.sort(compareEditorialCandidates);
 for(const {target} of ordered){
  if(Date.parse(target.updatedAt)<Date.parse(window.start)&&!pending.some(w=>w.stableTargetId===target.stableId))continue;
  for(const revision of target.evidence){
   if(!revision.title||nonFactRole(revision.title)||documents.some(d=>d.evidenceRevisionId===revision.id&&d.extractorVersion===CLAIM_EXTRACTOR))continue;
   const policy=`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`;
   const existing=scheduledRevisions.has(revision.id)||requests.some(r=>r.evidenceRevisionId===revision.id&&r.policyVersion===policy);if(existing)continue;
   await scheduleRematch(tx,JSON.stringify(['REASSESS',revision.sourceObservationId,'']),revision.id,now,policy);scheduledRevisions.add(revision.id);if(++scheduled===2)return;
  }
 }
}
