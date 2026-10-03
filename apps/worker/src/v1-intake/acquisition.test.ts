import { afterEach, beforeEach, expect, it } from 'vitest';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy, scopeFixture } from './test-utils';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { claimAcquisition, persistAcquisitionResult, completeAcquisition, runAcquisitionJob, AcquisitionFailure } from './acquisition';
import type { AcceptedAcquiredContent, DownstreamJob } from './types';
import { createCandidateAcquisitionRouter } from './acquisition-router';
import { hashContent } from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
const jobId=JSON.stringify(['ACQUIRE','observation-1','']);
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture())});
afterEach(async()=>ctx.dispose());
const now='2026-10-03T12:00:00Z',later='2026-10-03T12:02:00Z';
function content(candidateId:string):AcceptedAcquiredContent {return {id:'content-1',feedId:'feed-1',candidateId,sourceObservationId:'observation-1',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'A development',acquiredAt:now,acquisitionMethod:'supplied_payload'}}
it('concurrent duplicate deliveries claim one lease; crash before fetching resumes after expiry',async()=>{
 const claims=await Promise.all([claimAcquisition(store,jobId,now),claimAcquisition(new V1IntakeStore(ctx.db),jobId,now)]);
 expect(claims.filter(Boolean)).toHaveLength(1);
 const restarted=await claimAcquisition(new V1IntakeStore(ctx.db),jobId,later);expect(restarted).toBeDefined();
 expect(restarted!.job.attempts).toBe(2);
 await expect(persistAcquisitionResult(store,claims.find(Boolean)!,content(restarted!.candidate.id),later)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(await store.list('acquisition_results','feed-source-1')).toHaveLength(0);
});
it('restart after durable fetch resumes acceptance without another external fetch; acknowledgement replay is harmless',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;
 await persistAcquisitionResult(store,claim,content(claim.candidate.id),now);
 const renewed=(await claimAcquisition(new V1IntakeStore(ctx.db),jobId,later))!;
 await completeAcquisition(new V1IntakeStore(ctx.db),renewed,{...testPolicy,now:()=>later});
 let fetches=0;
 expect(await runAcquisitionJob(new V1IntakeStore(ctx.db),jobId,{...testPolicy,now:()=>later},async()=>{fetches++;return content(claim.candidate.id)})).toBe('SKIPPED');
 expect(fetches).toBe(0);expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value.state).toBe('DONE');
});
it('transient failures retry with bounded backoff; permanent errors preserve typed terminal state',async()=>{
 await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('NETWORK',true)});
 let job=(await store.read<DownstreamJob>('jobs',jobId))!.value;
 expect(job.state).toBe('PENDING');expect(job.failureCode).toBe('NETWORK');expect(job.nextAttemptAt).toBeDefined();
 expect(await claimAcquisition(store,jobId,now)).toBeUndefined();
 await runAcquisitionJob(store,jobId,{...testPolicy,now:()=>later},async()=>{throw new AcquisitionFailure('UNSUPPORTED',false)});
 job=(await store.read<DownstreamJob>('jobs',jobId))!.value;expect(job.state).toBe('FAILED');expect(job.failureCode).toBe('UNSUPPORTED');
 expect(await claimAcquisition(store,jobId,'2026-10-04T00:00:00Z')).toBeUndefined();
});
it('HTTP success without extracted article is a terminal extraction failure, never canonical evidence',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('<html>Login</html>')});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('FAILED');
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value.failureCode).toBe('EXTRACTION_FAILED');
});
it('existing direct HTTP extractor produces provenance and durable evidence; restart does not refetch',async()=>{
 let calls=0;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>{calls++;return new Response('<meta property="article:published_time" content="2026-10-03T10:00:00Z"><h1>Development</h1><article>Parliament approved the banking reform.</article>')}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('DONE');
 expect(await runAcquisitionJob(new V1IntakeStore(ctx.db),jobId,testPolicy,router)).toBe('SKIPPED');
 expect(calls).toBe(1);
 const acquired=(await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0];
 expect(acquired).toMatchObject({sourceId:'source-1',acquisitionMethod:'direct_http',representation:'FULL_ARTICLE',quality:{transportSuccess:true,extractionSuccess:true,extractionComplete:true},provenance:{stages:['HTTP']}});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
});
it('verified supplied payload precedes native and HTTP routes',async()=>{
 const request=batchFixture(2),payload={body:'Supplied source message'};
 request.observations[0].contentHash=await hashContent({representation:'ARTICLE_EXCERPT',body:payload.body});
 await createCandidateIntakePort(store,testPolicy).acceptBatch(request);
 let externalCalls=0;
 const router=createCandidateAcquisitionRouter({now:()=>now,readPayload:async()=>payload,fetcher:async()=>{externalCalls++;throw new Error('must not fetch')},stages:{structured:async()=>{externalCalls++;throw new Error('must not call native')}}});
 expect(await runAcquisitionJob(store,JSON.stringify(['ACQUIRE','observation-2','']),testPolicy,router)).toBe('DONE');
 expect(externalCalls).toBe(0);expect((await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0].representation).toBe('ARTICLE_EXCERPT');
});
it('browser fallback preserves bounded verifier provenance in durable acquired content',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('<html>Article loading</html>'),stagesForClaim:claim=>({webOperator:async()=>({stage:'WEB_OPERATOR',status:'SUCCESS',result:{items:[{sourceResource:'candidate-resource',canonicalItemUrl:claim.input.observation.canonicalUrl,sourceItemId:claim.input.observation.sourceItemKey,title:'Development',text:'Parliament approved the banking reform.',publishedAt:'2026-10-03T10:00:00Z',acquisitionEvidence:{acceptanceId:'verified',observationId:'browser-observed',rawArtifactRef:'raw/artifact',unrelated:'not-retained'}}],requestedWindow:{startTime:now,endTime:now},effectiveWindow:{startTime:now,endTime:now},acquisitionAsOf:now,coverage:{rangeCovered:false,truncated:false,stopReason:'SOURCE_EXHAUSTED'}}})})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('DONE');
 const acquired=(await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0];
 expect(acquired).toMatchObject({acquisitionMethod:'browser',provenance:{stages:['HTTP','WEB_OPERATOR'],browserEvidence:{acceptanceId:'verified',observationId:'browser-observed',rawArtifactRef:'raw/artifact'}}});
 expect(acquired.provenance?.browserEvidence).not.toHaveProperty('unrelated');
});
it('crash after external fetch but before result persistence allows bounded refetch',async()=>{
 const first=(await claimAcquisition(store,jobId,now))!;
 // The first worker fetched content but died without calling persistAcquisitionResult.
 content(first.candidate.id);
 let calls=0;
 expect(await runAcquisitionJob(new V1IntakeStore(ctx.db),jobId,{...testPolicy,now:()=>later},async claim=>{calls++;return content(claim.candidate.id)})).toBe('DONE');
 expect(calls).toBe(1);expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
});
it('persisted old fetch loses atomically to a newer accepted observation',async()=>{
 const first=(await claimAcquisition(store,jobId,now))!;await persistAcquisitionResult(store,first,content(first.candidate.id),now);
 await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture(2));
 await runAcquisitionJob(store,JSON.stringify(['ACQUIRE','observation-2','']),testPolicy,async claim=>({...content(claim.candidate.id),id:'content-2',sourceObservationId:'observation-2',body:'New development'}));
 const receipt=await completeAcquisition(store,first,testPolicy);expect(receipt.decision).toBe('IGNORED_STALE_OBSERVATION');
 expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
});
it('changed approval restrictions terminally retire a durable fetched result rather than requeue forever',async()=>{
 const first=(await claimAcquisition(store,jobId,now))!;await persistAcquisitionResult(store,first,content(first.candidate.id),now);
 await store.registerScope({...scopeFixture,feedRevision:2,restrictions:{publisherIds:['another-publisher']}});
 let calls=0;
 expect(await runAcquisitionJob(store,jobId,{...testPolicy,now:()=>later},async()=>{calls++;throw new Error('must not refetch')})).toBe('FAILED');
 expect(calls).toBe(0);expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'FAILED',failureCode:'APPROVAL_REVOKED'});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
 expect(await store.list('acquisition_results','feed-source-1')).toHaveLength(1);
});
