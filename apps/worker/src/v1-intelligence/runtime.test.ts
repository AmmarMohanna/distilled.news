import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {dispatchV1Intelligence,processV1Briefing,publicationWindow} from './runtime';
import type {Env,DistilledQueueMessage} from '../types';
import {livePublicationWindow} from './schedule';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,sent:DistilledQueueMessage[];
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});await seedIntelligence(store);sent=[];env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env});
afterEach(async()=>ctx.dispose());
it('cron dispatches only approved bounded feed windows; duplicate briefing delivery returns one persisted edition',async()=>{
 const now=new Date('2026-10-03T13:00:00Z');expect(await dispatchV1Intelligence(env,now)).toBe(1);
 const message=sent[0];expect(message.type).toBe('v1_briefing');
 if(message.type!=='v1_briefing') throw Error('wrong queue type');
 expect((await processV1Briefing(env,message,()=>now.toISOString()))?.stories).toHaveLength(1);
 await processV1Briefing(env,message,()=>now.toISOString());
 expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await dispatchV1Intelligence(env,now)).toBe(0);
 expect(await dispatchV1Intelligence({...env,V1_DOWNSTREAM_ENABLED:'false'},now)).toBe(0);
});
it('durable live scheduling carries IANA boundaries and supports quiet replay',async()=>{
 const schedule={durationMinutes:120 as const,timezone:'Asia/Beirut',deliveryAnchor:'08:00'};
 await store.registerFeed({...feedFixture,briefingSchedule:schedule,revision:2});
 const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;
 await intake.registerScope({...scope,feedRevision:2});
 const now=new Date('2026-10-03T15:00:00Z');await dispatchV1Intelligence(env,now);
 const message=sent.find(m=>m.type==='v1_briefing') as Extract<DistilledQueueMessage,{type:'v1_briefing'}>;
 expect(message.window).toEqual(livePublicationWindow(schedule,now));
 await processV1Briefing(env,message,()=>now.toISOString());
 await processV1Briefing(env,message,()=>now.toISOString());
 expect(await store.list('feed-1','briefing_requests')).toMatchObject([{state:'DONE'}]);
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(0);
},15000);
it('historical weekly configuration is excluded from new live cron work',async()=>{
 await store.registerFeed({...feedFixture,briefingFrequency:'WEEKLY',revision:2});
 expect(await dispatchV1Intelligence(env,new Date('2026-10-05T00:00:00Z'))).toBe(0);
 expect(sent).toHaveLength(0);
});
it('a disabled approval cannot publish even if a briefing message was already queued',async()=>{
 const now=new Date('2026-10-03T13:00:00Z');await dispatchV1Intelligence(env,now);
 const scope=await new V1IntakeStore(ctx.db).getScope('feed-source-1');await new V1IntakeStore(ctx.db).registerScope({...scope!,enabled:false});
 await expect(processV1Briefing(env,sent[0] as Extract<DistilledQueueMessage,{type:'v1_briefing'}>,()=>now.toISOString())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
});
it('recovers a committed edition whose request was not settled before a crash',async()=>{
 const now=new Date('2026-10-03T13:00:00Z');await dispatchV1Intelligence(env,now);
 const message=sent[0] as Extract<DistilledQueueMessage,{type:'v1_briefing'}>;
 const edition=(await processV1Briefing(env,message,()=>now.toISOString()))!;
 await feedTransact(store,'feed-1',async tx=>{
  const request=await tx.read<Record<string,unknown>>('briefing_requests',edition.id);
  await tx.write('briefing_requests',edition.id,{...request,state:'PENDING'});
 });
 expect((await processV1Briefing(env,message,()=>now.toISOString()))?.id).toBe(edition.id);
 expect(await store.read('feed-1','briefing_requests',edition.id)).toMatchObject({state:'DONE'});
 expect(await dispatchV1Intelligence(env,now)).toBe(0);
});
it('blocked synthesis requests cannot consume the bounded relay slots for eligible work',async()=>{
 const now=new Date('2026-10-03T13:00:00Z');
 await feedTransact(store,'feed-1',async tx=>{
  for(let i=0;i<3;i++) {
   const id=`blocked-${i}`,window={start:`2026-10-03T0${i}:00:00Z`,end:`2026-10-03T0${i+1}:00:00Z`,kind:'HOURLY' as const};
   await tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:now.toISOString()});
   if(i<2) await tx.write('synthesis_jobs',id,{id,feedId:'feed-1',state:i===0?'FAILED':'RUNNING',pendingCall:i===1?'unsettled':undefined});
  }
 });
 expect(await dispatchV1Intelligence(env,now)).toBe(2);
 expect(sent.some(m=>m.type==='v1_briefing' && m.window.start==='2026-10-03T02:00:00Z')).toBe(true);
});
it('publication windows are closed UTC intervals and weeks start Monday',()=>{
 expect(publicationWindow('30M',new Date('2026-10-03T13:17:00Z'))).toEqual({start:'2026-10-03T12:30:00.000Z',end:'2026-10-03T13:00:00.000Z',kind:'30M'});
 expect(publicationWindow('WEEKLY',new Date('2026-10-03T13:17:00Z'))).toEqual({start:'2026-09-21T00:00:00.000Z',end:'2026-09-28T00:00:00.000Z',kind:'WEEKLY'});
});
