import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {dispatchV1Intelligence} from './runtime';
import type {Env,DistilledQueueMessage} from '../types';
const failures={upgrade:false};
vi.mock('./extraction-upgrade',async original=>({...await original<typeof import('./extraction-upgrade')>(),hasUnscheduledExtractionUpgrade:async()=>{if(failures.upgrade)throw new Error('TEMPORARY_UNAVAILABLE');return false}}));
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,sent:DistilledQueueMessage[];
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});await seedIntelligence(store);sent=[];failures.upgrade=false;env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env});
afterEach(async()=>ctx.dispose());
it('a failing policy-upgrade maintenance step cannot starve publication dispatch, and is reported rather than hidden',async()=>{
 failures.upgrade=true;const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  expect(await dispatchV1Intelligence(env,new Date('2026-10-03T13:00:00Z'))).toBe(1);
  expect(sent.filter(m=>m.type==='v1_briefing')).toHaveLength(1);
  expect(log.mock.calls.some(call=>String(call[0]).includes('V1_DISPATCH_MAINTENANCE_FAILED'))).toBe(true);
 }finally{log.mockRestore()}
});
