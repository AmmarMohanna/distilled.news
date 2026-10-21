import type {EvidenceRevision} from '@distilled/contracts';
import type {FeedTransaction} from './store';
import type {EventRecord,StorylineRecord,StorylineVersion} from './types';
import type {EventSemanticState,Proposition} from './semantic-state';
import {INTELLIGENCE_POLICY} from './policies';

/** Prefetch the current review graph in bounded indexed reads. This does not
 * truncate candidates, reinterpret source order or weaken the commit fence.
 * Each retry gets a fresh transaction and therefore fresh roots and misses. */
export async function prefetchReviewGraph(tx:FeedTransaction,active:EvidenceRevision[]):Promise<void>{
 await tx.preloadLists(['events','storylines']);
 const [events,storylines]=await Promise.all([
  tx.list<EventRecord>('events'),tx.list<StorylineRecord>('storylines'),
  tx.preload('duplicates',active.map(r=>JSON.stringify([r.id,INTELLIGENCE_POLICY])))
 ]);
 await tx.preload('storyline_versions',storylines.map(s=>s.currentVersionId));
 const storyVersions=await Promise.all(storylines.map(s=>tx.read<StorylineVersion>('storyline_versions',s.currentVersionId)));
 const versionIds=[...new Set([...events.map(e=>e.currentVersionId),...storyVersions.flatMap(s=>s?.eventVersionIds??[])])];
 await tx.preloadMany([{kind:'event_versions',ids:versionIds},{kind:'event_semantic_states',ids:versionIds}]);
 const states=(await Promise.all(versionIds.map(id=>tx.read<EventSemanticState>('event_semantic_states',id)))).filter((s):s is EventSemanticState=>Boolean(s));
 await tx.preloadMany([
  {kind:'propositions',ids:states.flatMap(s=>s.propositionIds)},
  {kind:'entities',ids:states.flatMap(s=>s.entityIds)},
  {kind:'state_slots',ids:states.flatMap(s=>s.stateSlotIds)}
 ]);
 const members=await tx.membershipsForVersions(versionIds),revisionIds=[...active.map(r=>r.id),...members.map(m=>m.evidenceRevisionId)],mentionIds:string[]=[];
 // Previous semantic state can retain immutable supporting revisions as well.
 for(const state of states)for(const id of state.propositionIds){const p=await tx.read<Proposition>('propositions',id);revisionIds.push(...p?.evidenceRevisionIds??[]);mentionIds.push(...p?.claimMentionIds??[])}
 await Promise.all([tx.preload('claim_mentions',mentionIds),tx.preloadRevisions(revisionIds)]);
}
