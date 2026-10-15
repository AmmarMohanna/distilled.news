import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scoreAndSelect,ADAPTIVE_BRIEFING_PROCESSING} from './scoring';

let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));
 store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);
});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});

it('selection batches duplicate-support lookups across distinct Events without losing either candidate',async()=>{
 await seedIntelligence(store,1,'Lebanon Parliament approved banking reform legislation.');
 await seedIntelligence(store,2,'Beirut airport reopened after runway repairs.','publisher-2');
 expect(await store.list('feed-1','events')).toHaveLength(2);
 const read=vi.spyOn(store,'read');
 const selection=await scoreAndSelect(store,'feed-1',{start:'2026-10-03T11:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'},ADAPTIVE_BRIEFING_PROCESSING,'2026-10-03T13:00:00Z');
 expect(selection.candidateIds).toHaveLength(2);
 expect(read.mock.calls.filter(([,kind])=>kind==='duplicates')).toHaveLength(0);
},30000);
