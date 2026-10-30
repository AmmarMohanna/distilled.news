import {afterEach,beforeEach,expect,it} from 'vitest';
import {batchFixture,createIntakeDatabase,seedIntakeScope,testPolicy} from './test-utils';
import {V1IntakeStore,itemId} from './store';
import {createCandidateIntakePort} from './intake';
import {deferInitialAcquisitionBacklog} from './acquisition-backlog';
import {claimAcquisition} from './acquisition';
import {V1FeedStore} from '../v1-intelligence/store';
import {feedFixture} from '../v1-intelligence/test-utils';
import type {CandidateRecord,DownstreamJob} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
const now='2026-10-03T12:00:00Z',jobId=(n:number)=>JSON.stringify(['ACQUIRE',`observation-${n}`,'']);
const policy={...testPolicy,verifySuppliedContent:async(o:import('@distilled/contracts').SourceObservation)=>o.contentHash?{contentHash:o.contentHash,representation:o.representation,contentCompleteness:o.contentCompleteness}:undefined};
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await new V1FeedStore(ctx.db).registerFeed(feedFixture);});
afterEach(async()=>ctx.dispose());
const batch=(n=1)=>{const b=batchFixture(n);b.observations[0].publishedAtHint='2026-10-02T10:00:00Z';b.proposals[0].publishedAtHint=b.observations[0].publishedAtHint;return b;};
it('defers unchanged initial backlog without scraping, erasing its input or reporting acquisition success',async()=>{
 const b=batch();await createCandidateIntakePort(store,policy).acceptBatch(b);
 const original=await store.read('inputs','observation-1');
 expect(await deferInitialAcquisitionBacklog(store,'feed-source-1',now)).toBe(1);
 expect(await deferInitialAcquisitionBacklog(store,'feed-source-1',now)).toBe(0);
 expect((await store.read<DownstreamJob>('jobs',jobId(1)))!.value).toMatchObject({state:'DEFERRED',attempts:0,deferred:{reason:'INITIAL_BACKLOG',publishedAtHint:'2026-10-02T10:00:00Z',feedCreatedAt:now}});
 expect(await claimAcquisition(store,jobId(1),now)).toBeUndefined();
 expect(await store.read('inputs','observation-1')).toEqual(original);expect(await store.read('acquisition_results',jobId(1))).toBeUndefined();
 const next=batch(2);expect((await createCandidateIntakePort(store,policy).acceptBatch(next)).receipts[0].decision).toBe('REPLAY');
 expect(await store.read('jobs',jobId(2))).toBeUndefined();expect(await store.read('inputs','observation-2')).toBeDefined();
});
it.each(['missing-date','new-date','revision','authoritative','changed-text','explicit-recovery','existing-evidence','running','saved-result','correction'])('retains runnable acquisition for %s',async mode=>{
 const first=batch();await createCandidateIntakePort(store,policy).acceptBatch(first);
 let target=jobId(1);
 if(mode==='changed-text'){const changed=batch(2);changed.observations[0].contentHash='b'.repeat(64);await createCandidateIntakePort(store,policy).acceptBatch(changed);target=jobId(2);}
 else if(['missing-date','new-date','revision','authoritative','correction'].includes(mode)){
  // A distinct immutable discovery; never edit a previously accepted input.
  const next=batch(2);if(mode==='missing-date')delete next.observations[0].publishedAtHint;
  if(mode==='new-date')next.observations[0].publishedAtHint=now;
  if(mode==='revision')next.observations[0].sourceRevision={scheme:'updated',value:now,comparability:'OPAQUE',authority:'ORIGIN'};
  if(mode==='authoritative')next.observations[0].authoritativeCurrentState=true;
  if(mode==='correction')next.observations[0].titleHint='Correction: agency revises its earlier report';
  next.proposals[0].publishedAtHint=next.observations[0].publishedAtHint;next.proposals[0].titleHint=next.observations[0].titleHint;
  await createCandidateIntakePort(store,policy).acceptBatch(next);target=jobId(2);
 }else{
  const job=(await store.read<DownstreamJob>('jobs',target))!.value;
  if(mode==='running')await store.commit(await store.snapshot('feed-source-1'),[{table:'jobs',id:target,value:{...job,state:'RUNNING',leaseToken:'active',leaseUntil:'2026-10-03T12:01:00Z'}}]);
  if(mode==='explicit-recovery')await store.commit(await store.snapshot('feed-source-1'),[{table:'jobs',id:target,value:{...job,recoveryAuthorizations:[{id:'review',priorAttempts:0,priorFailureCode:'NETWORK',maxAttempts:1,authorizedAt:now}]}}]);
  if(mode==='saved-result')await store.commit(await store.snapshot('feed-source-1'),[{table:'acquisition_results',id:target,itemKey:'guid-1',value:{id:'saved-content',feedId:'feed-1',candidateId:itemId('feed-source-1','guid-1'),sourceObservationId:'observation-1',representation:'FULL_ARTICLE',contentCompleteness:'COMPLETE',body:'Retained article body.',acquiredAt:now,acquisitionMethod:'direct_http'},immutable:true}]);
  if(mode==='existing-evidence')await store.commit(await store.snapshot('feed-source-1'),[{table:'evidence',id:itemId('feed-source-1','guid-1'),itemKey:'guid-1',value:{state:'ACTIVE'}}]);
 }
 expect(await deferInitialAcquisitionBacklog(store,'feed-source-1',now,1,target)).toBe(0);
 expect((await store.read<DownstreamJob>('jobs',target))!.value.state).not.toBe('DEFERRED');
});
it('coalesces identical verified discoveries while retaining receipts, and acquires changed text',async()=>{
 const port=createCandidateIntakePort(store,policy);
 await port.acceptBatch(batch());const next=batch(2);
 expect((await port.acceptBatch(next)).receipts[0]).toMatchObject({decision:'REPLAY',checkpointResolution:'RESOLVED'});
 expect(await store.read('jobs',jobId(2))).toBeUndefined();expect(await store.read('inputs','observation-2')).toBeDefined();
 const changed=batch(3);changed.observations[0].contentHash='b'.repeat(64);expect((await port.acceptBatch(changed)).receipts[0].decision).toBe('ACCEPTED');
 expect((await store.read<DownstreamJob>('jobs',jobId(3)))!.value.state).toBe('PENDING');
 expect((await store.read<CandidateRecord>('candidates',itemId('feed-source-1','guid-1')))!.value).toMatchObject({firstObservationId:'observation-1',acquisitionObservationId:'observation-3'});
});
it('does not coalesce unverifiable content or retry a terminal failed job by calling it replay',async()=>{
 const port=createCandidateIntakePort(store,testPolicy);await port.acceptBatch(batch());await port.acceptBatch(batch(2));expect(await store.read('jobs',jobId(2))).toBeDefined();
 const verified=createCandidateIntakePort(store,policy),j=(await store.read<DownstreamJob>('jobs',jobId(2)))!.value;
 await store.commit(await store.snapshot('feed-source-1'),[{table:'jobs',id:j.id,value:{...j,state:'FAILED'}}]);
 expect((await verified.acceptBatch(batch(3))).receipts[0].decision).toBe('ACCEPTED');expect(await store.read('jobs',jobId(3))).toBeDefined();
});
it('does not coalesce onto a job with a different unpaid-only capability',async()=>{
 await createCandidateIntakePort(store,policy).acceptBatch(batch());
 expect((await createCandidateIntakePort(store,{...policy,unpaidOnly:true}).acceptBatch(batch(2))).receipts[0].decision).toBe('ACCEPTED');
 expect((await store.read<DownstreamJob>('jobs',jobId(2)))!.value.unpaidOnly).toBe(true);
});
it('keeps old financial operations unchanged while deferring bounded legacy backlog',async()=>{
 await createCandidateIntakePort(store,testPolicy).acceptBatch(batch());
 await ctx.db.exec("CREATE TABLE connector_provider_operations(operation_id TEXT,headers TEXT,reserved REAL);INSERT INTO connector_provider_operations VALUES('old','uncertain',0.05)");
 const before=await ctx.db.prepare('SELECT * FROM connector_provider_operations').all();
 const candidate=(await store.read<CandidateRecord>('candidates',itemId('feed-source-1','guid-1')))!.value;const {firstObservationId:_,acquisitionObservationId:__,...legacy}=candidate;
 await store.commit(await store.snapshot('feed-source-1'),[{table:'candidates',id:candidate.id,itemKey:'guid-1',value:legacy}]);
 expect(await deferInitialAcquisitionBacklog(store,'feed-source-1',now)).toBe(1);
 expect(await ctx.db.prepare('SELECT * FROM connector_provider_operations').all()).toEqual(before);
});
it('does not let deferred backlog inflate displayed acquisition work or hold a publication window',async()=>{
 const {windowIntakeCoverage}=await import('../v1-intelligence/window-coverage');
 await createCandidateIntakePort(store,policy).acceptBatch(batch());
 expect((await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T12:30:00Z')).pendingJobs).toBe(1);
 await deferInitialAcquisitionBacklog(store,'feed-source-1',now);
 expect(await windowIntakeCoverage(ctx.db,'feed-1','2026-10-03T12:30:00Z')).toMatchObject({state:'COMPLETE',pendingJobs:0,failedJobs:0});
 expect((await store.read<DownstreamJob>('jobs',jobId(1)))!.value.state).toBe('DEFERRED');
});

