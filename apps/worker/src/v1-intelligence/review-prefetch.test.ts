import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,seedCurrentEvidence,scopeFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {FeedTransaction,V1FeedStore} from './store';
import {prefetchReviewGraph} from './review-prefetch';
import {INTELLIGENCE_POLICY} from './policies';
import type {FeedRecord} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const now=testPolicy.now(),feed:FeedRecord={id:'feed-1',ownerId:'owner-1',title:'Feed',interests:[],geography:[],outputLanguage:'en',briefingFrequency:'DAILY',paused:false,revision:1,createdAt:now,updatedAt:now};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});

it('prefetches 240 current supports in bounded queries, with no individual graph reads',async()=>{
 const {revision}=await seedCurrentEvidence(new V1IntakeStore(ctx.db)),rows:D1PreparedStatement[]=[],revisions=[];
 const doc=(kind:string,id:string,value:unknown)=>rows.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,id,feed.id,JSON.stringify(value)));
 for(let n=0;n<240;n++){
  const r={...revision,id:'revision-'+n,evidenceId:'evidence-'+n};revisions.push(r);
  rows.push(ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(r.id,scopeFixture.feedSourceId,'item-'+n,JSON.stringify(r)));
  const version='version-'+n;
  doc('events','event-'+n,{id:'event-'+n,feedId:feed.id,currentVersionId:version});
  doc('event_versions',version,{id:version,feedId:feed.id});
  doc('memberships','member-'+n,{id:'member-'+n,eventVersionId:version,evidenceRevisionId:r.id});
  doc('duplicates',JSON.stringify([r.id,INTELLIGENCE_POLICY]),{id:JSON.stringify([r.id,INTELLIGENCE_POLICY]),feedId:feed.id});
  doc('event_semantic_states',version,{id:version,feedId:feed.id,propositionIds:['proposition-'+n],entityIds:[],stateSlotIds:[]});
  doc('propositions','proposition-'+n,{id:'proposition-'+n,feedId:feed.id,evidenceRevisionIds:[r.id]});
 }
 for(let offset=0;offset<rows.length;offset+=90)await ctx.db.batch(rows.slice(offset,offset+90));
 const tx=new FeedTransaction(store,await store.snapshot(feed.id)),read=vi.spyOn(store,'read'),revisionRead=vi.spyOn(store,'revision');
 await prefetchReviewGraph(tx,revisions);
 for(let n=0;n<240;n++){
  expect(await tx.revision('revision-'+n)).toMatchObject({id:'revision-'+n});
  expect(await tx.read('event_versions','version-'+n)).toMatchObject({id:'version-'+n});
  expect(await tx.read('propositions','proposition-'+n)).toMatchObject({id:'proposition-'+n});
 }
 expect(read).not.toHaveBeenCalled();expect(revisionRead).not.toHaveBeenCalled();
 expect(tx.metrics.documentReads).toBe(0);expect(tx.metrics.revisionReads).toBe(0);
 expect(tx.metrics.preloadQueries+tx.metrics.listReads).toBeLessThanOrEqual(20);
 // Prefetch cannot authorize a stale commit or hide source configuration changes.
 await new V1IntakeStore(ctx.db).registerScope({...scopeFixture,enabled:false});
 expect(await store.commit(tx)).toBe(false);
},30000);

it('bulk revision misses remain scoped, and a new CAS attempt reloads previous misses',async()=>{
 await new V1IntakeStore(ctx.db).registerScope({...scopeFixture,feedId:'foreign-feed',feedSourceId:'foreign-source'});
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind('foreign','foreign-source','item',JSON.stringify({id:'foreign'})).run();
 const tx=new FeedTransaction(store,await store.snapshot(feed.id));
 await tx.preloadRevisions(['foreign','revision-seed']);
 expect(await tx.revision('foreign')).toBeUndefined();expect(await tx.revision('revision-seed')).toBeUndefined();
 await seedCurrentEvidence(new V1IntakeStore(ctx.db));
 expect(await tx.revision('revision-seed')).toBeUndefined();
 const fresh=new FeedTransaction(store,await store.snapshot(feed.id));await fresh.preloadRevisions(['revision-seed']);
 expect(await fresh.revision('revision-seed')).toMatchObject({feedId:feed.id});
});
