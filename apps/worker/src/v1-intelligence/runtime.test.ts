import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {dispatchV1Intelligence,processV1Briefing,publicationWindow} from './runtime';
import type {Env,DistilledQueueMessage} from '../types';
import {readScheduleAudit} from './schedule-audit';
import {livePublicationWindow} from './schedule';
import {DeterministicSalienceScorer} from './salience';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env,sent:DistilledQueueMessage[];
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed({...feedFixture,briefingFrequency:'HOURLY'});await seedIntelligence(store);sent=[];env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env});
afterEach(async()=>ctx.dispose());
it('salience contention cannot exhaust request retries while one judgment is in flight',async()=>{
 const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
 let finish!:(value:any)=>void;
 const scorer={score:async(input:import('./salience').SalienceInput)=>new Promise<any>(resolve=>{finish=()=>resolve(new DeterministicSalienceScorer().score(input))})};
 const pending=processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,scorer);
 while(!finish)await new Promise(resolve=>setTimeout(resolve,10));
 try{
  for(let i=0;i<5;i++)await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,scorer)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
  expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'PENDING',attempts:0});
 }finally{finish(undefined);await pending}
},15000);
it('cron dispatches only approved bounded feed windows; duplicate briefing delivery returns one persisted edition',async()=>{
 env.V1_DOWNSTREAM_FEED_SOURCE_IDS=['feed-source-1',...Array.from({length:11},(_,i)=>`unapproved-${i}`)].join(',');
 const now=new Date('2026-10-03T13:00:00Z');expect(await dispatchV1Intelligence(env,now)).toBe(1);
 const message=sent[0];expect(message.type).toBe('v1_briefing');
 if(message.type!=='v1_briefing') throw Error('wrong queue type');
 expect((await processV1Briefing(env,message,()=>now.toISOString()))?.stories).toHaveLength(1);
 await processV1Briefing(env,message,()=>now.toISOString());
 expect(await store.list('feed-1','editions')).toHaveLength(1);expect(await dispatchV1Intelligence(env,now)).toBe(0);
 expect(await dispatchV1Intelligence({...env,V1_DOWNSTREAM_ENABLED:'false'},now)).toBe(0);
});
it('projects only actually communicated grounded claims after publication and recovers projection on replay',async()=>{
 const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T13:00:00Z',kind:'HOURLY' as const};
 const edition=(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end))!;
 const entries=await store.list<any>('feed-1','ledger_entries' as any);expect(entries).toHaveLength(edition.stories.flatMap(s=>s.claims).length);
 expect(entries[0]).toMatchObject({editionId:edition.id,claimText:edition.stories[0].claims[0].text,evidenceRevisionIds:edition.stories[0].claims[0].support.map(s=>s.evidenceRevisionId)});
 await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end);expect(await store.list('feed-1','ledger_entries' as any)).toEqual(entries);
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

it('records an intake-blocked boundary durably before dispatch gating and detects later missing invocations',async()=>{
 const intake=new V1IntakeStore(ctx.db),job=JSON.stringify(['REASSESS','observation-1','']);
 await ctx.db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','PENDING') WHERE id=?").bind(job).run();
 const first=new Date('2026-10-03T13:00:00Z');await dispatchV1Intelligence(env,first);
 const requests=await store.list<any>('feed-1','briefing_requests');expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({state:'PENDING',reason:'AWAITING_INTAKE_REASSESSMENT',window:{end:first.toISOString()}});
 await dispatchV1Intelligence(env,new Date('2026-10-03T16:00:00Z'));
 const observations=await store.list<any>('feed-1','schedule_observations');expect(observations).toHaveLength(2);
 const gap=observations.find(o=>o.missingExpectedBoundaries.length);expect(gap.missingExpectedBoundaries.map((w:any)=>w.end)).toEqual(['2026-10-03T15:00:00.000Z','2026-10-03T14:00:00.000Z']);
 // Gap observations never fabricate historical quiet results or requests.
 expect(await store.list('feed-1','briefing_requests')).toHaveLength(2);
},20000);

it('independent health reads expose a missing scheduler invocation without creating a fake request',async()=>{
 const audit=await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-03T13:06:00Z'));expect(audit).toMatchObject({state:'MISSING_SCHEDULED_BOUNDARY',reason:'NO_DURABLE_REQUEST'});expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
},15000);

it('health preserves completed editorial deferral without calling it quiet or unclassified',async()=>{
 const now=new Date('2026-10-03T13:00:00Z');await dispatchV1Intelligence(env,now);
 const request=(await store.list<any>('feed-1','briefing_requests'))[0];
 await feedTransact(store,'feed-1',async tx=>{await tx.write('briefing_requests',request.id,{...request,state:'DONE',result:'DEFERRED',reason:'EDITORIAL_WORK_DEFERRED',completedAt:now.toISOString()})});
 expect(await readScheduleAudit(ctx.db,'feed-1',new Date('2026-10-03T13:06:00Z'))).toMatchObject({state:'DEFERRED',reason:'EDITORIAL_WORK_DEFERRED',requestId:request.id});
 expect(await store.list('feed-1','editions')).toHaveLength(0);
});
async function pendingJobObservedAt(observedAt:string,extra:Record<string,unknown>={}){
 // Intake rows are immutable, so model a new arrival as its own observation plus its own reassessment job.
 const observationId=`late-${observedAt}`,id=JSON.stringify(['REASSESS',observationId,'']);
 await ctx.db.prepare("INSERT OR REPLACE INTO v1_inputs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)").bind(observationId,'feed-source-1','late-item',JSON.stringify({observation:{id:observationId,observedAt}})).run();
 await ctx.db.prepare("INSERT OR REPLACE INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)").bind(id,'feed-source-1','late-item',JSON.stringify({id,feedId:'feed-1',feedSourceId:'feed-source-1',observationId,kind:'REASSESS',state:'PENDING',attempts:0,...extra})).run();
}
const briefingSends=()=>sent.filter(m=>m.type==='v1_briefing');
it('reobserving the same intake wait does not invalidate concurrent Feed work',async()=>{
 await pendingJobObservedAt('2026-10-03T12:30:00Z');
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:25:00Z'));
 const before=await store.snapshot('feed-1');
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:26:00Z'));
 expect((await store.snapshot('feed-1')).epoch).toBe(before.epoch);
 expect(await store.list('feed-1','briefing_requests')).toMatchObject([{state:'PENDING',reason:'AWAITING_INTAKE_REASSESSMENT'}]);
});
it('reassessment of evidence that arrived after the window closed cannot postpone that window, and is not lost',async()=>{
 await pendingJobObservedAt('2026-10-03T13:20:00Z');
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:25:00Z'));
 expect(briefingSends()).toHaveLength(1);expect(briefingSends()[0]).toMatchObject({window:{end:'2026-10-03T13:00:00.000Z'}});
 // The still-pending job stays on the ordinary reassessment queue for the next window.
 expect(sent.filter(m=>m.type==='v1_reassess')).toHaveLength(1);
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:25:00Z'));expect(await store.list('feed-1','briefing_requests')).toHaveLength(1);
});
it('reassessment of evidence that arrived inside the window still holds that window and records why',async()=>{
 await pendingJobObservedAt('2026-10-03T12:30:00Z');
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:25:00Z'));
 expect(briefingSends()).toHaveLength(0);expect(await store.list('feed-1','briefing_requests')).toMatchObject([{state:'PENDING',reason:'AWAITING_INTAKE_REASSESSMENT'}]);
 // Once the job is exhausted the window is released instead of blocking forever.
 await pendingJobObservedAt('2026-10-03T12:30:00Z',{exhausted:true,state:'FAILED'});
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:26:00Z'));expect(briefingSends()).toHaveLength(1);
});
it('an older unblocked window is dispatched while a newer window still waits for its own reassessment',async()=>{
 const older={start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:00:00Z',kind:'HOURLY' as const};
 await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests','older',{id:'older',feedId:'feed-1',window:older,state:'PENDING',attempts:0,createdAt:'2026-10-03T12:00:00Z'}));
 await pendingJobObservedAt('2026-10-03T12:30:00Z');
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:25:00Z'));
 expect(briefingSends().map(m=>(m as any).window.end)).toEqual(['2026-10-03T12:00:00Z']);
});
it('a released intake wait label is cleared once and unchanged waits never rewrite the request',async()=>{
 await pendingJobObservedAt('2026-10-03T12:30:00Z');
 const at=new Date('2026-10-03T13:25:00Z'),epoch=async()=>(await store.getFeed('feed-1'))!.revision;
 await dispatchV1Intelligence(env,at);const before=await epoch();await dispatchV1Intelligence(env,at);await dispatchV1Intelligence(env,at);
 expect(await epoch()).toBe(before);
 await pendingJobObservedAt('2026-10-03T12:30:00Z',{exhausted:true,state:'FAILED'});
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:26:00Z'));
 expect((await store.list<any>('feed-1','briefing_requests'))[0].reason).toBeUndefined();
});
