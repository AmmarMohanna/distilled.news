import {expect,it,vi} from 'vitest';
import type {Env} from '../types';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import type {DownstreamJob} from '../v1-intake/types';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {windowHasHoldingJobs,windowIntakeCoverage} from './window-coverage';
import {CLOCK_PREPARATION_POLICY,livePublicationWindow} from './schedule';
import {consumeWindowReadinessWake,observeWindowReadiness,readWindowReadiness,sweepWindowReadiness,type WindowReadinessWake} from './window-readiness';
import type {BriefingRequest} from './runtime';

it('projects guarded intake writes, retains terminal counts and delivers the latest wake once',async()=>{
  const {db,dispose}=await createIntakeDatabase({product:true});
  try{
    const intake=new V1IntakeStore(db);
    await seedIntakeScope(intake);
    await new V1FeedStore(db).registerFeed(feedFixture);
    const origin=new Date(Math.ceil(Date.now()/1800_000)*1800_000);
    const window=livePublicationWindow({durationMinutes:30,timezone:'UTC',clockStartAt:origin.toISOString(),clockPolicy:CLOCK_PREPARATION_POLICY},
      new Date(+origin+25*60_000));
    const request:BriefingRequest={id:'window',feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'};
    const beforeDelivery=new Date(window.end),delivery=new Date(window.scheduledFor!);
    const send=vi.fn<(message:WindowReadinessWake)=>Promise<void>>().mockResolvedValue(undefined);
    const env={DB:db,WINDOW_READINESS_MODE:'shadow',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_ACQUISITION_QUEUE:{send}} as unknown as Env;
    await db.prepare("INSERT INTO v1_feed_documents VALUES('briefing_requests',?,?,?)").bind(request.id,request.feedId,JSON.stringify(request)).run();
    const acquire:DownstreamJob={id:'acquire',feedId:'feed-1',feedSourceId:'feed-source-1',observationId:'observation',kind:'ACQUIRE',state:'RUNNING',attempts:1,leaseToken:'owner',leaseUntil:window.scheduledFor};
    const review:DownstreamJob={...acquire,id:'review',kind:'REASSESS',state:'PENDING',attempts:0,leaseToken:undefined,leaseUntil:undefined};
    const save=(job:DownstreamJob)=>db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(job.id,job.feedSourceId,JSON.stringify(job)).run();
    await save(acquire);
    await db.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2000)
      INSERT INTO v1_jobs(id,feed_source_id,json) SELECT 'historical-'||x,'feed-source-1',json_object('kind','ACQUIRE','state','FAILED','failureCode','NETWORK') FROM n`).run();
    await observeWindowReadiness(env,request,beforeDelivery);
    expect(await readWindowReadiness(db,request.id,+beforeDelivery)).toMatchObject({holding:true,pending_acquisition:1,pending_review:0,failed:2000});
    expect(await db.prepare('SELECT COUNT(*) AS n FROM v1_window_job_memberships').first()).toEqual({n:1});

    const scope=await intake.snapshot(acquire.feedSourceId);
    const writes=[{table:'jobs' as const,id:review.id,value:review},{table:'jobs' as const,id:acquire.id,value:{...acquire,state:'DONE'}}];
    expect(await intake.commit(scope,writes,[{id:acquire.id,feedSourceId:acquire.feedSourceId,serialized:JSON.stringify({...acquire,leaseToken:'stale'})}])).toBe(false);
    expect(await readWindowReadiness(db,request.id,+beforeDelivery)).toMatchObject({pending_acquisition:1,pending_review:0});
    expect(await intake.commit(scope,writes,[{id:acquire.id,feedSourceId:acquire.feedSourceId,serialized:JSON.stringify(acquire)}])).toBe(true);
    expect(await readWindowReadiness(db,request.id,+beforeDelivery)).toMatchObject({pending_acquisition:0,pending_review:1});
    expect(await db.prepare('SELECT event_id FROM v1_window_ready_outbox').first()).toBeNull();

    const reviewCompletion=db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','DONE') WHERE id=?").bind(review.id);
    const completion=await reviewCompletion.run();
    const previous=await db.prepare('SELECT event_id FROM v1_window_ready_outbox').first<{event_id:string}>();
    expect(previous?.event_id).toMatch(/^window-ready:window:/);
    await sweepWindowReadiness(env,beforeDelivery);
    expect(send).not.toHaveBeenCalled();

    // A confirmed local capacity wait only yields at delivery. A newer
    // membership invalidates any event for the previous job set.
    await db.prepare("INSERT INTO v1_inputs(id,feed_source_id,json) VALUES('observed','feed-source-1',?)")
      .bind(JSON.stringify({observation:{observedAt:window.start}})).run();
    await save({...acquire,id:'capacity',observationId:'observed',state:'PENDING',leaseUntil:undefined,failureCode:'BACKPRESSURE',failureDetail:'HELPER_LOCAL_CAPACITY_BUSY'});
    expect(await readWindowReadiness(db,request.id,+beforeDelivery)).toMatchObject({holding:true,released:0});
    const reads:number[]=[];
    const measuredDb={prepare:(sql:string)=>({bind:(...args:unknown[])=>{
      const read=async()=>{const result=await db.prepare(sql).bind(...args).all();reads.push(result.meta.rows_read);return result;};
      return {all:read,first:async()=>(await read()).results[0]??null};
    }})} as unknown as D1Database;
    const canonical=await windowIntakeCoverage(measuredDb,request.feedId,window.end,{v3:true,now:window.scheduledFor});
    expect(canonical).toMatchObject({pendingJobs:0,failedJobs:2001});
    expect(await readWindowReadiness(measuredDb,request.id,+delivery)).toMatchObject({holding:false,released:1,failed:2000});
    expect(await windowHasHoldingJobs(measuredDb,request.feedId,window.end,{v3:true,now:window.scheduledFor})).toBe(false);
    expect(reads[0]).toBeGreaterThanOrEqual(2000);
    expect(reads[1]).toBeLessThan(20);

    const active={...env,WINDOW_READINESS_MODE:'relay'} as Env;
    const relay=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);
    await consumeWindowReadinessWake(active,{type:'window_readiness_wake',eventId:previous!.event_id,feedId:request.feedId},relay,delivery);
    expect(relay).not.toHaveBeenCalled();
    await sweepWindowReadiness(active,new Date(+delivery-1));
    expect(send).not.toHaveBeenCalled();
    await sweepWindowReadiness(active,delivery);
    expect(send).toHaveBeenCalledOnce();
    const wake=send.mock.calls[0][0];
    const redelivery=new Date(+delivery+120_000);
    await sweepWindowReadiness(active,redelivery);
    expect(send.mock.calls.map(([message])=>message.eventId)).toEqual([wake.eventId,wake.eventId]);
    await consumeWindowReadinessWake(active,wake,relay,delivery);
    await consumeWindowReadinessWake(active,wake,relay,redelivery);
    expect(relay).toHaveBeenCalledOnce();

    // A stable mismatch retires the current wake. Repair rebuilds from the
    // same canonical request without resetting its schedule or attempts.
    await db.prepare('UPDATE v1_window_readiness SET pending_review=1 WHERE window_id=?').bind(request.id).run();
    await observeWindowReadiness(active,request,delivery);
    expect(await readWindowReadiness(db,request.id,+delivery)).toBeUndefined();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM v1_window_ready_outbox').first()).toEqual({n:0});
    const repair=new Date(+delivery+300_000);
    await sweepWindowReadiness(active,repair);
    await observeWindowReadiness(active,request,repair);
    expect(await readWindowReadiness(db,request.id,+repair)).toMatchObject({holding:false,pending_review:0,released:1});

    await db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0) WHERE id='feed-source-1'").run();
    expect(await readWindowReadiness(db,request.id,+delivery)).toBeUndefined();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM v1_window_ready_outbox').first()).toEqual({n:0});
    await db.prepare("UPDATE v1_jobs SET json=json_set(json,'$.state','PENDING') WHERE id=?").bind(review.id).run();
    const canonicalCompletion=await reviewCompletion.run();
    console.info(JSON.stringify({terminalJobs:2000,canonicalCoverageRows:reads[0],projectionRows:reads[1],canonicalHoldingRows:reads[2],
      canonicalCompletionWrites:canonicalCompletion.meta.rows_written,projectedCompletionWrites:completion.meta.rows_written}));
  }finally{await dispose();}
},60_000);
