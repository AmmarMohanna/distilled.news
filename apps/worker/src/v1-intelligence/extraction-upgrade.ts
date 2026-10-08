import {CLAIM_EXTRACTOR,nonFactRole,type SourceDocument} from './claims';
import {targets,type PublicationWindow} from './scoring';
import {scheduleRematch} from './rematch';
import type {FeedTransaction} from './store';
import type {EditorialWork} from './editorial-work';
/** Bounded policy rollout through the ordinary rematch queue. No new evidence,
 * source fetch, synthetic edition or special API. Existing model fences/budgets apply. */
export async function scheduleExtractionUpgrades(tx:FeedTransaction,window:PublicationWindow,now:string){
 const documents=await tx.list<SourceDocument>('source_documents'),work=await tx.list<EditorialWork>('editorial_deferred_work'),resolved=new Set((await tx.list<{id:string;workId:string}>('editorial_work_resolutions')).map(r=>r.workId));
 const pending=work.filter(w=>!resolved.has(w.id));let scheduled=0;
 for(const target of await targets(tx,window,true)){
  if(Date.parse(target.updatedAt)<Date.parse(window.start)&&!pending.some(w=>w.stableTargetId===target.stableId))continue;
  for(const revision of target.evidence){
   if(!revision.title||nonFactRole(revision.title)||documents.some(d=>d.evidenceRevisionId===revision.id&&d.extractorVersion===CLAIM_EXTRACTOR))continue;
   const policy=`claim-extraction-upgrade:${CLAIM_EXTRACTOR}`;
   const existing=(await tx.list<import('./rematch').RematchRequest>('rematch_requests')).some(r=>r.evidenceRevisionId===revision.id&&r.policyVersion===policy);if(existing)continue;
   await scheduleRematch(tx,JSON.stringify(['REASSESS',revision.sourceObservationId,'']),revision.id,now,policy);if(++scheduled===2)return;
  }
 }
}
