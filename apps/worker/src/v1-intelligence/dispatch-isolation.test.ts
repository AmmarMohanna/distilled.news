import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,scopeFixture} from '../v1-intake/test-utils';
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
it('continues with other feeds and due reviews after a feed lookup fails',async()=>{
 const intake=new V1IntakeStore(ctx.db);
 await intake.registerScope({...scopeFixture,feedSourceId:'feed-source-2',feedId:'feed-2',sourceId:'source-2'});
 await store.registerFeed({...feedFixture,id:'feed-2',createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'HOURLY'});
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind('review-2','feed-source-1',JSON.stringify({id:'review-2',kind:'REASSESS',state:'PENDING',attempts:0,nextAttemptAt:'2026-10-03T12:00:00Z'})).run();
 const getFeed=V1FeedStore.prototype.getFeed;
 const failing=vi.spyOn(V1FeedStore.prototype,'getFeed').mockImplementation(function(this:V1FeedStore,id){
  if(id==='feed-1')return Promise.reject(Error('D1 temporarily unavailable'));
  return getFeed.call(this,id);
 });
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  await dispatchV1Intelligence({...env,BRIEFING_ENGINE:'v3',OPENROUTER_API_KEY:'fixture',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1,feed-source-2'},new Date('2026-10-03T13:00:00Z'));
  expect(sent).toContainEqual({type:'v1_reassess',jobId:'review-2'});
  expect(sent).toContainEqual(expect.objectContaining({type:'v1_briefing',feedId:'feed-2'}));
  expect(log.mock.calls.some(([message])=>String(message).includes('V1_FEED_DISPATCH_FAILED'))).toBe(true);
 }finally{failing.mockRestore();log.mockRestore();}
});
