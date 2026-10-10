import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,FeedTransaction,feedTransact} from './store';
import type {FeedRecord} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const now=testPolicy.now(),feed:FeedRecord={id:'feed-1',ownerId:'owner-1',title:'Feed',interests:[],geography:[],outputLanguage:'en',briefingFrequency:'DAILY',paused:false,revision:1,createdAt:now,updatedAt:now};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
afterEach(async()=>ctx.dispose());
it('read-only relay checks do not invalidate writers; real writes still fence stale snapshots',async()=>{
 const snapshot=await store.snapshot(feed.id),writer=new FeedTransaction(store,snapshot);
 await writer.write('intelligence_receipts','receipt-1',{id:'receipt-1',feedId:feed.id});
 for(let i=0;i<3;i++)await feedTransact(store,feed.id,tx=>tx.list('briefing_requests'));
 expect((await store.snapshot(feed.id)).epoch).toBe(snapshot.epoch);
 expect(await store.commit(writer)).toBe(true);
 expect((await store.snapshot(feed.id)).epoch).toBe(snapshot.epoch+1);
 expect(await store.commit(new FeedTransaction(store,snapshot))).toBe(false);
});
it('concurrent source configuration mutation invalidates the feed snapshot before any intelligence effect',async()=>{
 let executions=0;
 await feedTransact(store,feed.id,async tx=>{
  executions++;
  if(executions===1) await new V1IntakeStore(ctx.db).registerScope({...scopeFixture,enabled:false});
  await tx.write('intelligence_receipts','receipt-1',{id:'receipt-1',feedId:feed.id,attempt:executions});
 });
 expect(executions).toBe(2);expect(await new V1FeedStore(ctx.db).read(feed.id,'intelligence_receipts','receipt-1')).toMatchObject({attempt:2});
});
it('feed definition changes require a revision; immutable support cannot be overwritten or rebound',async()=>{
 await expect(store.registerFeed({...feed,title:'Changed'})).rejects.toThrow('V1_FEED_IDENTITY');
 await store.registerFeed({...feed,title:'Changed',revision:2});
 await feedTransact(store,feed.id,async tx=>tx.write('intelligence_receipts','receipt-1',{id:'receipt-1',feedId:feed.id,value:'original'}));
 await expect(feedTransact(store,feed.id,async tx=>tx.write('intelligence_receipts','receipt-1',{id:'receipt-1',feedId:feed.id,value:'changed'}))).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 await expect(feedTransact(store,feed.id,async tx=>tx.write('roles','role-2',{id:'role-2',feedId:'another-feed'}))).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await store.registerFeed({...feed,revision:3,deletedAt:now});
 await expect(feedTransact(store,feed.id,async()=>undefined)).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.read(feed.id,'intelligence_receipts','receipt-1')).toMatchObject({value:'original'});
});

it('a scoped list supplies transaction reads without a second document query; staged writes still win',async()=>{
 await feedTransact(store,feed.id,tx=>tx.write('briefing_requests','request-cache',{id:'request-cache',feedId:feed.id,state:'PENDING'}));
 const tx=new FeedTransaction(store,await store.snapshot(feed.id)),read=vi.spyOn(store,'read');
 const listed=await tx.list<any>('briefing_requests');expect(listed).toHaveLength(1);
 expect(await tx.read('briefing_requests','request-cache')).toEqual(listed[0]);expect(read).not.toHaveBeenCalled();
 await tx.write('briefing_requests','request-cache',{...listed[0],state:'DONE'});
 expect(await tx.read<any>('briefing_requests','request-cache')).toMatchObject({state:'DONE'});
 expect(await store.commit(tx)).toBe(true);
 const fresh=new FeedTransaction(store,await store.snapshot(feed.id));expect(await fresh.read<any>('briefing_requests','request-cache')).toMatchObject({state:'DONE'});
 read.mockRestore();
});
it('scoped list cache cannot hide a foreign global document ID or a concurrent revision change',async()=>{
 await store.registerFeed({...feed,id:'other-feed'});
 await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('briefing_requests','foreign','other-feed',JSON.stringify({id:'foreign',feedId:'other-feed'})).run();
 const tx=new FeedTransaction(store,await store.snapshot(feed.id));await tx.list('briefing_requests');
 await expect(tx.read('briefing_requests','foreign')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 await store.registerFeed({...feed,title:'Changed',revision:2});expect(await store.commit(tx)).toBe(false);
});

it('mutating a listed immutable document cannot mutate its cached prior value or hide a conflict',async()=>{
 await feedTransact(store,feed.id,tx=>tx.write('intelligence_receipts','original',{id:'original',feedId:feed.id,value:'original'}));
 const tx=new FeedTransaction(store,await store.snapshot(feed.id)),row=(await tx.list<any>('intelligence_receipts'))[0];row.value='changed';
 await expect(tx.write('intelligence_receipts',row.id,row)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 expect(await tx.read<any>('intelligence_receipts',row.id)).toMatchObject({value:'original'});
});

it('identifies an intake-scope CAS failure separately from an unchanged Feed epoch',async()=>{
 const log=vi.spyOn(console,'warn').mockImplementation(()=>undefined),beforeEpoch=(await store.snapshot(feed.id)).scopes.find(s=>s.id===scopeFixture.feedSourceId)!.epoch;let runs=0;
 try{
  await feedTransact(store,feed.id,async tx=>{
   if(++runs===1)await new V1IntakeStore(ctx.db).registerScope(scopeFixture);
   await tx.write('intelligence_receipts','scope-diagnostic',{id:'scope-diagnostic',feedId:feed.id});
  });
  const event=log.mock.calls.map(c=>{try{return JSON.parse(String(c[0]))}catch{return {}}}).find(v=>v.type==='V1_FEED_CAS_REJECTED');
  expect(event).toMatchObject({feedEpochChanged:false,scopeSetChanged:false,scopeChanges:[{id:scopeFixture.feedSourceId,before:beforeEpoch,after:beforeEpoch+1}],observedAfterRejection:true});
  expect(event.queries.documentReads).toBeGreaterThan(0);expect(runs).toBe(2);
 }finally{log.mockRestore()}
});
