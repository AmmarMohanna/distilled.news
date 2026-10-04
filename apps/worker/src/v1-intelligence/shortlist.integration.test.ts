import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {processV1Briefing} from './runtime';
import {withdrawV1Edition} from './public-read';
import {prepareSemanticShortlist} from './shortlist';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env;await seedIntelligence(store)});
afterEach(async()=>ctx.dispose());
it('keeps suspected repetition for comparative review and retrieves old active correction work',async()=>{
 const edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY'}},()=> '2026-10-03T13:00:00Z'))!;
 await seedIntelligence(store,2,'Lebanon Parliament approved banking reform legislation.','publisher-b','2026-10-03T13:15:00Z');
 const first=await prepareSemanticShortlist(store,'feed-1',{start:'2026-10-03T13:00:00Z',end:'2026-10-03T14:00:00Z',kind:'HOURLY'},'2026-10-03T14:00:00Z');expect(first.candidates).toHaveLength(1);expect(first.candidates[0].flags).toContain('POSSIBLE_REPEAT');
 await withdrawV1Edition(ctx.db,edition.id,feedFixture.ownerId,'OWNER_REQUEST','2026-10-03T14:00:00Z');
 const later=await prepareSemanticShortlist(store,'feed-1',{start:'2026-10-03T15:00:00Z',end:'2026-10-03T16:00:00Z',kind:'HOURLY'},'2026-10-03T16:00:00Z',0);expect(later.candidates).toHaveLength(1);expect(later.candidates[0].protectedReasons).toContain('CORRECTION_OBLIGATION');expect(later.obligations).toHaveLength(1);
},20000);
