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
it('root preloading batches owned reads while retaining staged writes and isolation',async()=>{
 await store.registerFeed({...feed,id:'foreign-feed'});
 const batch=vi.fn((statements:D1PreparedStatement[])=>ctx.db.batch(statements));
 const measured=new V1FeedStore({prepare:(sql:string)=>ctx.db.prepare(sql),batch} as unknown as D1Database);
 const tx=new FeedTransaction(measured,await measured.snapshot(feed.id));
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('roles','foreign-role','foreign-feed',JSON.stringify({id:'foreign-role',feedId:'foreign-feed'})).run();
 await tx.preloadLists(['roles','duplicates','roles']);
 expect(batch).toHaveBeenCalledTimes(1);expect(batch.mock.calls[0][0]).toHaveLength(2);
 await tx.write('roles','local-role',{id:'local-role',feedId:feed.id});
 expect(await tx.list('roles')).toEqual([{id:'local-role',feedId:feed.id}]);
 expect(await tx.list('duplicates')).toEqual([]);
 await tx.preloadLists(['roles']);expect(batch).toHaveBeenCalledTimes(1);
});
async function seedDocuments(documents:{kind:string;id:string;value:unknown}[]){
 const statements:D1PreparedStatement[]=[];
 for(let i=0;i<documents.length;i+=500)statements.push(ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT json_extract(value,'$.kind'),json_extract(value,'$.id'),?,json_extract(value,'$.value') FROM json_each(?)").bind(feed.id,JSON.stringify(documents.slice(i,i+500))));
 await ctx.db.batch(statements);
}

it('prefetches 240 current supports in bounded queries, with no individual graph reads',async()=>{
 const {revision}=await seedCurrentEvidence(new V1IntakeStore(ctx.db)),rows:{kind:string;id:string;value:unknown}[]=[],revisions=[];
 const doc=(kind:string,id:string,value:unknown)=>rows.push({kind,id,value});
 for(let n=0;n<240;n++){
  const r={...revision,id:'revision-'+n,evidenceId:'evidence-'+n};revisions.push(r);
  const version='version-'+n;
  doc('events','event-'+n,{id:'event-'+n,feedId:feed.id,currentVersionId:version});
  doc('event_versions',version,{id:version,feedId:feed.id});
  doc('memberships','member-'+n,{id:'member-'+n,eventVersionId:version,evidenceRevisionId:r.id});
  doc('duplicates',JSON.stringify([r.id,INTELLIGENCE_POLICY]),{id:JSON.stringify([r.id,INTELLIGENCE_POLICY]),feedId:feed.id});
  doc('event_semantic_states',version,{id:version,feedId:feed.id,propositionIds:['proposition-'+n],entityIds:[],stateSlotIds:[]});
  doc('propositions','proposition-'+n,{id:'proposition-'+n,feedId:feed.id,evidenceRevisionIds:[r.id]});
 }
 await ctx.db.prepare("INSERT INTO v1_revisions(id,feed_source_id,item_key,json) SELECT json_extract(value,'$.id'),?,'item-'||key,value FROM json_each(?)").bind(scopeFixture.feedSourceId,JSON.stringify(revisions)).run();
 await seedDocuments(rows);
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
it('retained membership history does not implicitly preload unrelated historical article bodies',async()=>{
 const {revision}=await seedCurrentEvidence(new V1IntakeStore(ctx.db));
 const writes:{kind:string;id:string;value:unknown}[]=[];
 for(let i=0;i<1000;i++)writes.push({kind:'memberships',id:'historical-'+i,value:{id:'historical-'+i,eventVersionId:'retired-'+i,evidenceRevisionId:'old-revision-'+i}});
 await seedDocuments(writes);
 const tx=new FeedTransaction(store,await store.snapshot(feed.id));
 await prefetchReviewGraph(tx,[revision]);
 expect(tx.metrics.preloadQueries).toBeLessThanOrEqual(3);
 expect(await tx.revision(revision.id)).toEqual(revision);
 // History is retained and readable; it is simply no longer eagerly expanded.
 expect(await tx.list('memberships')).toHaveLength(1000);
});
