import {afterEach,beforeEach,expect,it} from 'vitest';
import type {EventVersion,EventMembership} from '@distilled/contracts';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1FeedStore} from './store';
import {processEvidenceIntelligence} from './engine';
import {deterministicMatchers} from './matchers';
import type {FeedRecord,EventRecord,StorylineVersion,DuplicateDecision} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,intake:V1IntakeStore,store:V1FeedStore;
const now=testPolicy.now(),feed:FeedRecord={id:'feed-1',ownerId:'owner-1',title:'Lebanon news',interests:['banking reform'],geography:['Lebanon'],outputLanguage:'en',briefingFrequency:'DAILY',paused:false,revision:1,createdAt:now,updatedAt:now};
beforeEach(async()=>{ctx=await createIntakeDatabase();intake=new V1IntakeStore(ctx.db);await seedIntakeScope(intake);store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
afterEach(async()=>ctx.dispose());
async function acquire(sequence:number,body:string,key='guid-1',feedSourceId='feed-source-1') {
 const batch=batchFixture(sequence);batch.coverage.feedSourceId=feedSourceId;
 batch.observations[0]={...batch.observations[0],feedSourceId,sourceItemKey:key};batch.proposals[0]={...batch.proposals[0],feedSourceId,sourceItemKey:key};
 const result=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:`acquired-${sequence}`,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:`observation-${sequence}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body,publishedAt:'2026-10-03T10:00:00Z',acquiredAt:now,acquisitionMethod:'supplied_payload'},testPolicy);
 return JSON.stringify(['REASSESS',`observation-${sequence}`,'']);
}
it('concurrent/restarted reassessment creates one exact immutable event/support/storyline graph',async()=>{
 const job=await acquire(1,'Lebanon Parliament approved banking reform legislation.');
 const [a,b]=await Promise.all([processEvidenceIntelligence(store,job,now),processEvidenceIntelligence(new V1FeedStore(ctx.db),job,now)]);
 expect(a).toEqual(b);
 const events=await store.list<EventRecord>('feed-1','events');expect(events).toHaveLength(1);
 const version=(await store.list<EventVersion>('feed-1','event_versions'))[0];expect(version.version).toBe(1);
 await expect(store.read('another-feed','event_versions',version.id)).rejects.toMatchObject({code:'SCOPE_DENIED'});
 const members=await store.list<EventMembership>('feed-1','memberships');expect(members).toHaveLength(1);
 expect(members[0].eventVersionId).toBe(version.id);expect(await store.revision('feed-1',members[0].evidenceRevisionId)).toBeDefined();
 const storyline=(await store.list<StorylineVersion>('feed-1','storyline_versions'))[0];expect(storyline.eventVersionIds).toEqual([version.id]);
 await expect(ctx.db.prepare("UPDATE v1_feed_documents SET json='{}' WHERE kind='event_versions'").run()).rejects.toThrow('V1_IMMUTABLE');
});
it('independent wording attaches to the same event and is not mislabeled as copied content',async()=>{
 const bodies=['Lebanon Parliament approved banking reform legislation after a debate on Tuesday.','Lebanon legislature passed banking reform law following negotiations.'];
 for(let i=0;i<bodies.length;i++) await processEvidenceIntelligence(store,await acquire(i+1,bodies[i],`item-${i}`),now);
 expect(await store.list('feed-1','events')).toHaveLength(1);
 const decisions=await store.list<DuplicateDecision>('feed-1','duplicates');expect(decisions.filter(d=>d.kind==='UNIQUE')).toHaveLength(2);
});
it('equal acceptance timestamps do not hide copies; unrelated same-country developments stay separate',async()=>{
 const bodies=['Lebanon Parliament approved banking reform legislation after a debate on Tuesday.','Lebanon Parliament approved banking reform legislation after a debate on Tuesday.','Lebanon earthquake destroyed homes in Beirut.'];
 for(let i=0;i<bodies.length;i++) await processEvidenceIntelligence(store,await acquire(i+1,bodies[i],`item-${i}`),now);
 expect(await store.list('feed-1','events')).toHaveLength(2);
 const decisions=await store.list<DuplicateDecision>('feed-1','duplicates');expect(decisions.filter(d=>d.kind==='EXACT')).toHaveLength(1);expect(decisions.filter(d=>d.kind==='UNIQUE')).toHaveLength(2);
});
it('changed evidence reassigns support without mutating old versions; ordered deletion withdraws future support',async()=>{
 const first=await acquire(1,'Lebanon Parliament proposed banking reform legislation.');await processEvidenceIntelligence(store,first,now);
 const old=await store.list<EventVersion>('feed-1','event_versions');
 const oldStoryline=(await store.list<StorylineVersion>('feed-1','storyline_versions'))[0];
 await processEvidenceIntelligence(store,await acquire(2,'Lebanon Parliament approved banking reform legislation.'),now);
 expect(await store.list('feed-1','events')).toHaveLength(2);
 expect(await store.read('feed-1','event_versions',old[0].id)).toEqual(old[0]);
 expect(await store.list('feed-1','storylines')).toHaveLength(1);
 const evolved=(await store.list<StorylineVersion>('feed-1','storyline_versions')).find(v=>v.version===2)!;
 expect(evolved.storylineId).toBe(oldStoryline.storylineId);expect(evolved.previousState).toBe(oldStoryline.currentState);
 const batch=batchFixture(3);batch.observations[0]={...batch.observations[0],operation:'DELETE',authoritativeCurrentState:true,suppliedPayloadRef:undefined,contentHash:undefined};batch.proposals=[];
 await createCandidateIntakePort(intake,{...testPolicy,orderingFor:async()=>({...await testPolicy.orderingFor(batch.observations[0]),authoritativeReplacementAllowed:true})}).acceptBatch(batch);
 expect((await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-3','']),now)).decision).toBe('WITHDRAWN');
 const roots=await store.list<EventRecord>('feed-1','events');for(const r of roots) expect((await store.read<EventVersion>('feed-1','event_versions',r.currentVersionId))!.type).toBe('WITHDRAWN');
});
it('identical replay before original reassessment does not lose intelligence work',async()=>{
 const first=await acquire(1,'Lebanon Parliament approved banking reform legislation.');
 await acquire(2,'Lebanon Parliament approved banking reform legislation.');
 expect((await processEvidenceIntelligence(store,first,now)).decision).toBe('PROCESSED');expect(await store.list('feed-1','events')).toHaveLength(1);
});
it('long copied background cannot merge distinct proposal and approval developments',async()=>{
 const background=' Officials described the banking framework, financial institutions, regulation, public consultation, economic priorities, capital markets and the next procedural steps.'.repeat(10);
 await processEvidenceIntelligence(store,await acquire(1,'Lebanon Parliament proposed banking reform legislation.'+background,'proposal'),now);
 await processEvidenceIntelligence(store,await acquire(2,'Lebanon Parliament approved banking reform legislation.'+background,'approval'),now);
 expect(await store.list('feed-1','events')).toHaveLength(2);
 expect((await store.list<DuplicateDecision>('feed-1','duplicates')).every(d=>d.kind==='UNIQUE')).toBe(true);
 expect(await store.list('feed-1','storylines')).toHaveLength(1);
});
it('prepared matcher decisions separate similar developments without overriding exact support',async()=>{
 await processEvidenceIntelligence(store,await acquire(1,'Lebanon Parliament approved banking reform legislation.','first'),now);
 const matchers={event:{match:()=>({structuralRelation:'NEW_STORYLINE',epistemicEffects:['CHANGES_STATE'],confidence:.9,provenance:{scorer:'PREPARED',policyVersion:'fixture'}})},storyline:{match:()=>({relation:'NEW',confidence:.9,provenance:{scorer:'PREPARED',policyVersion:'fixture'}})}};
 await processEvidenceIntelligence(store,await acquire(2,'Lebanon Parliament approved banking reform legislation after a different vote.','second'),now,matchers as any);
 expect(await store.list('feed-1','events')).toHaveLength(2);
 expect(await store.list('feed-1','storylines')).toHaveLength(2);
 const latest=(await store.list<EventVersion>('feed-1','event_versions')).filter(v=>v.version===1);expect(latest).toHaveLength(2);
 for(const version of latest)expect((await store.list<EventMembership>('feed-1','memberships')).filter(m=>m.eventVersionId===version.id)).toHaveLength(1);
});
it('a prepared new Event can explicitly continue a known Storyline despite weak lexical continuity',async()=>{
 await processEvidenceIntelligence(store,await acquire(1,'Lebanon Parliament approved banking reform legislation.','first'),now);
 const storylineId=(await store.list<{id:string}>('feed-1','storylines'))[0].id;
 const event={match:()=>({structuralRelation:'NEW_EVENT_EXISTING_STORYLINE',storylineId,epistemicEffects:['ADDS_DETAIL'],confidence:.9,provenance:{scorer:'PREPARED',policyVersion:'fixture'}})};
 await processEvidenceIntelligence(store,await acquire(2,'Central bank begins implementing new capital requirements.','second'),now,{...deterministicMatchers,event} as any);
 expect(await store.list('feed-1','events')).toHaveLength(2);expect(await store.list('feed-1','storylines')).toHaveLength(1);
 const versions=await store.list<StorylineVersion>('feed-1','storyline_versions');expect(versions.find(v=>v.version===2)?.eventVersionIds).toHaveLength(2);
});
