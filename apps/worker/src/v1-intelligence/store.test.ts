import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import type {FeedRecord} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
const now=testPolicy.now(),feed:FeedRecord={id:'feed-1',ownerId:'owner-1',title:'Feed',interests:[],geography:[],outputLanguage:'en',briefingFrequency:'DAILY',paused:false,revision:1,createdAt:now,updatedAt:now};
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feed)});
afterEach(async()=>ctx.dispose());
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
