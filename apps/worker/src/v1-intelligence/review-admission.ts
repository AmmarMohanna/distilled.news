import type {EvidenceRevision,EventMembership} from '@distilled/contracts';
import {V1IntakeStore} from '../v1-intake/store';
import type {DownstreamJob} from '../v1-intake/types';
import {feedTransact,type FeedTransaction,type V1FeedStore} from './store';
import type {LedgerEntry} from './ledger';

/** Publication-time admission before paid intelligence. Discovery time never
 * turns pre-subscription material into current news. No evidence is deleted. */
export async function backlogRevisionIds(store:V1FeedStore,tx:FeedTransaction):Promise<Set<string>> {
 const active=await store.currentEvidence(tx.snapshot.feed.id),created=Date.parse(tx.snapshot.feed.createdAt);
 const old=active.filter(e=>e.revision.publishedAt&&Date.parse(e.revision.publishedAt)<created);
 if(!old.length)return new Set();
 const ledger=await tx.list<LedgerEntry>('ledger_entries'),members=await tx.list<EventMembership>('memberships');
 // Same-source revisions must still repair existing knowledge/publication memory.
 const ids=[...new Set(members.map(m=>m.evidenceRevisionId))];
 if(ids.length)await tx.preloadRevisions(ids);
 const supports:(EvidenceRevision|undefined)[]=[];for(const id of ids)supports.push(await tx.revision(id));
 return new Set(old.filter(({revision})=>!ledger.some(l=>l.evidenceRevisionIds.includes(revision.id))&&!supports.some(r=>r&&r.id!==revision.id&&r.evidenceId===revision.evidenceId)).map(e=>e.revision.id));
}

export async function retainBacklogReview(store:V1FeedStore,jobId:string,now:string):Promise<boolean>{
 const intake=new V1IntakeStore(store.db),row=await intake.read<DownstreamJob>('jobs',jobId);
 if(!row||row.value.kind!=='REASSESS')return false;
 return feedTransact(store,row.value.feedId,async tx=>{
  const current=await intake.read<DownstreamJob>('jobs',jobId);if(!current)return false;
  const active=await store.currentEvidence(row.value.feedId),revision=active.find(e=>e.revision.sourceObservationId===current.value.observationId)?.revision;
  if(!revision||!(await backlogRevisionIds(store,tx)).has(revision.id))return false;
  const id=JSON.stringify([jobId,revision.id,'publication-time-admission-v1']);
  if(!await tx.read('review_admissions',id))await tx.write('review_admissions',id,{id,feedId:row.value.feedId,jobId,evidenceRevisionId:revision.id,disposition:'BACKLOG_RETAINED',reason:'PRE_SUBSCRIPTION_PUBLICATION',publishedAt:revision.publishedAt,feedCreatedAt:tx.snapshot.feed.createdAt,createdAt:now});
  if(current.value.state!=='DONE')tx.completeJob(current.value);
  return true;
 });
}
