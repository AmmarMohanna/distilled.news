import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});
it('a many-claim document persists losslessly without one D1 read roundtrip per proposition',async()=>{
 let reads=0,mentionReads=0;const read=store.read.bind(store);
 vi.spyOn(store,'read').mockImplementation(async(feedId,kind,id)=>{if(kind==='propositions')reads++;if(kind==='claim_mentions')mentionReads++;return read(feedId,kind,id) as any});
 await seedIntelligence(store,1,Array.from({length:12},(_,i)=>`Officials confirmed development ${i+1}.`).join(' '));
 expect(reads).toBeLessThanOrEqual(2);expect(mentionReads).toBeLessThanOrEqual(2);expect(await store.list('feed-1','propositions')).toHaveLength(12);
},15000);
