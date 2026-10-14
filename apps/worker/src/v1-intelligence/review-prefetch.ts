import type {EventMembership,EvidenceRevision} from '@distilled/contracts';
import type {FeedTransaction} from './store';
import type {EventRecord,StorylineRecord,StorylineVersion} from './types';
import type {EventSemanticState,Proposition} from './semantic-state';
import {INTELLIGENCE_POLICY} from './policies';

/** Prefetch the current review graph in bounded indexed reads. This does not
 * truncate candidates, reinterpret source order or weaken the commit fence.
 * Each retry gets a fresh transaction and therefore fresh roots and misses. */
export async function prefetchReviewGraph(tx:FeedTransaction,active:EvidenceRevision[]):Promise<void>{
 const events=await tx.list<EventRecord>('events'),storylines=await tx.list<StorylineRecord>('storylines');
 const members=await tx.list<EventMembership>('memberships');
 await tx.preload('duplicates',active.map(r=>JSON.stringify([r.id,INTELLIGENCE_POLICY])));
 await tx.preload('storyline_versions',storylines.map(s=>s.currentVersionId));
 const storyVersions=await Promise.all(storylines.map(s=>tx.read<StorylineVersion>('storyline_versions',s.currentVersionId)));
 const versionIds=[...new Set([...events.map(e=>e.currentVersionId),...storyVersions.flatMap(s=>s?.eventVersionIds??[])])];
 await tx.preload('event_versions',versionIds);
 await tx.preload('event_semantic_states',versionIds);
 const states=(await Promise.all(versionIds.map(id=>tx.read<EventSemanticState>('event_semantic_states',id)))).filter((s):s is EventSemanticState=>Boolean(s));
 await tx.preload('propositions',states.flatMap(s=>s.propositionIds));
 await tx.preload('entities',states.flatMap(s=>s.entityIds));
 await tx.preload('state_slots',states.flatMap(s=>s.stateSlotIds));
 const versions=new Set(versionIds),revisionIds=[...active.map(r=>r.id),...members.filter(m=>versions.has(m.eventVersionId)).map(m=>m.evidenceRevisionId)];
 // Previous semantic state can retain immutable supporting revisions as well.
 for(const state of states)for(const id of state.propositionIds){const p=await tx.read<Proposition>('propositions',id);revisionIds.push(...p?.evidenceRevisionIds??[])}
 await tx.preloadRevisions(revisionIds);
}
