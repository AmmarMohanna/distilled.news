import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from './v1-intake/test-utils';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {enqueueV1,pendingV1Jobs,recordV1QueueOutcome} from './v1-queue-dispatch';
import type {Env} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,env:Env;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));await new V1FeedStore(ctx.db).registerFeed(feedFixture);env={DB:ctx.db,PROCESSING_QUEUE:{send:vi.fn(async()=>{})}} as unknown as Env});
afterEach(async()=>ctx.dispose());
it('crashed transport claims recover, while concurrent send admission has one winner',async()=>{
 const now=new Date('2026-10-03T12:00:00Z'),body={type:'v1_reassess' as const,jobId:'one'};
 expect((await Promise.all([enqueueV1(env,body.type,'one',body,now),enqueueV1(env,body.type,'one',body,now)])).filter(Boolean)).toHaveLength(1);
 expect(await enqueueV1(env,body.type,'one',body,new Date(now.getTime()+120000))).toBe(true);
});
it('exhausted queue deliveries have durable diagnostics without pretending resource/semantic work completed',async()=>{
 await recordV1QueueOutcome(env,'message',{type:'v1_reassess',jobId:'pending'},5,'TEMPORARY_UNAVAILABLE');
 await recordV1QueueOutcome(env,'message',{type:'v1_reassess',jobId:'pending'},5,'TEMPORARY_UNAVAILABLE');
 const rows=await ctx.db.prepare('SELECT outcome,reason FROM v1_queue_outcomes').all();
 expect(rows.results).toEqual([{outcome:'DELIVERY_EXHAUSTED',reason:'TEMPORARY_UNAVAILABLE'}]);
 expect(await new V1IntakeStore(ctx.db).list('jobs','feed-source-1')).toHaveLength(0);
});
it('closed-window work precedes unrelated backfill, and oldest-first turns retain fairness',async()=>{
 await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests','closed','feed-1',?)").bind(JSON.stringify({id:'closed',state:'PENDING',window:{start:'2026-10-03T11:00:00Z',end:'2026-10-03T12:00:00Z'}})).run();
 for(const [id,time] of [['old','2026-10-01T00:00:00Z'],['current','2026-10-03T11:30:00Z']]){
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({observation:{observedAt:time,publishedAtHint:time}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'feed-source-1',JSON.stringify({id,kind:'REASSESS',state:'PENDING',attempts:0,observationId:id})).run();
 }
 expect((await pendingV1Jobs(env,'feed-source-1','REASSESS',new Date('2026-10-03T12:01:00Z'))).map(j=>j.id)).toEqual(['current','old']);
 expect((await pendingV1Jobs(env,'feed-source-1','REASSESS',new Date('2026-10-03T12:05:00Z'))).map(j=>j.id)).toEqual(['old','current']);
});

it('a later exhausted delivery does not disappear behind the first retry record',async()=>{
 const body={type:'v1_reassess',jobId:'pending'};
 await recordV1QueueOutcome(env,'same-message',body,1,'TEMPORARY_UNAVAILABLE');
 await recordV1QueueOutcome(env,'same-message',body,5,'TEMPORARY_UNAVAILABLE');
 expect((await ctx.db.prepare('SELECT attempts,outcome FROM v1_queue_outcomes ORDER BY attempts').all()).results).toEqual([{attempts:1,outcome:'RETRYABLE_WAIT'},{attempts:5,outcome:'DELIVERY_EXHAUSTED'}]);
});

it('malformed window metadata cannot prevent durable rejection diagnostics',async()=>{
 await recordV1QueueOutcome(env,'invalid-window',{type:'v1_briefing',feedId:'feed-1',window:{start:'invalid',end:'invalid'}},1,'INVALID_REQUEST');
 expect((await ctx.db.prepare('SELECT outcome,reason FROM v1_queue_outcomes').all()).results).toEqual([{outcome:'DELIVERY_REJECTED',reason:'INVALID_REQUEST'}]);
});
