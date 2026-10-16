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
it('downloads outside admission while claim and promotion use short admitted phases',async()=>{
 let admitted=false,phases=0;
 const admission={run:async<T>(run:()=>Promise<T>):Promise<T>=>{expect(admitted).toBe(false);admitted=true;phases++;try{return await run()}finally{admitted=false}},isBusy:()=>false};
 expect(await runAcquisitionJob(store,jobId,testPolicy,async claim=>{expect(admitted).toBe(false);return content(claim.candidate.id)},admission)).toBe('DONE');
 expect(phases).toBe(2);expect(admitted).toBe(false);
});
it('repeated completion admission waits retain fetched bytes and consume no recovery attempts',async()=>{
 const busy=new Error('capacity');let calls=0,admissions=0;
 const execute=async(claim:Awaited<ReturnType<typeof claimAcquisition>>)=>{calls++;return content(claim!.candidate.id)};
 const admission={run:async<T>(run:()=>Promise<T>):Promise<T>=>{if(++admissions%2===1)return run();throw busy},isBusy:(error:unknown)=>error===busy};
 for(let i=0;i<9;i++){
  await expect(runAcquisitionJob(store,jobId,testPolicy,execute,admission)).rejects.toBe(busy);
  expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:1,resumeAttempts:0});
 }
 expect(calls).toBe(1);
 expect(await runAcquisitionJob(store,jobId,testPolicy,execute,{run:complete=>complete(),isBusy:()=>false})).toBe('DONE');
 expect(calls).toBe(1);expect(await store.list('revisions','feed-source-1')).toHaveLength(1);
});
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
it('full-article mode upgrades an RSS excerpt and preserves the publisher date and canonical identity',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,readPayload:async()=>({body:'Feed excerpt only'}),fetcher:async()=>new Response('<meta property="article:published_time" content="2026-10-03T10:00:00Z"><h1>Actual article</h1><article>'+ 'Full publisher text. '.repeat(30)+'</article>')});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('DONE');
 const acquired=(await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0];
 expect(acquired.representation).toBe('FULL_ARTICLE');expect(acquired.publishedAt).toBe('2026-10-03T10:00:00.000Z');expect(acquired.body).toContain('Full publisher text.');
 expect(acquired.provenance).toMatchObject({stages:['HTTP']});
});
it('retains RSS time precision and both date observations after full article extraction',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;claim.input.observation.publishedAtHint='2026-10-03T10:52:44Z';
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,fetcher:async()=>new Response('<meta property="article:published_time" content="2026-10-03"><h1>Development</h1><article>'+ 'Full reporting. '.repeat(30)+'</article>')});
 expect(await router(claim)).toMatchObject({publishedAt:'2026-10-03T10:52:44.000Z',provenance:{publicationDate:{timestampSource:'connector_precision_same_article_date',articlePublishedAt:'2026-10-03T00:00:00.000Z',connectorPublishedAt:'2026-10-03T10:52:44.000Z'}}});
});
it('an anonymous private HTTP fallback retrieves an exact RSS article after a public 403',async()=>{
 let privateCalls=0;
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,fetcher:async()=>new Response('Forbidden',{status:403}),
  publicArticle:async exact=>{privateCalls++;expect(exact).toBe(url);return {status:200,url:exact,pageKind:'article',body:'Publisher article text. '.repeat(25),title:'Decision',publishedAt:'2026-10-03T10:00:00Z'}}});
 const acquired=await router(claim);expect(privateCalls).toBe(1);expect(acquired).toMatchObject({representation:'FULL_ARTICLE',canonicalUrl:url,publishedAt:'2026-10-03T10:00:00.000Z',acquisitionProvider:'private_public_http'});
});
it.each([401,429,451])('status %s never invokes the anonymous fallback',async status=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status}),publicArticle:async()=>{calls++;throw Error('must not call')}});
 const claim=(await claimAcquisition(store,jobId,now))!;
 await expect(router(claim)).rejects.toMatchObject({code:status===401?'AUTH_REQUIRED':status===429?'RATE_LIMIT':'POLICY_DENIED'});expect(calls).toBe(0);
});
it('a 403 carrying WWW-Authenticate remains an authentication requirement',async()=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('Login',{status:403,headers:{'www-authenticate':'Basic realm="private"'}}),publicArticle:async()=>{calls++;throw Error('must not call')}});
 await expect(router((await claimAcquisition(store,jobId,now))!)).rejects.toMatchObject({code:'AUTH_REQUIRED'});expect(calls).toBe(0);
});
it.each(['listing','wrong-url','private-denied'])('private fallback never promotes %s as an exact full article',async kind=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:403}),publicArticle:async()=>kind==='private-denied'?{status:403}:{status:200,url:kind==='wrong-url'?url+'/sibling':url,pageKind:kind==='listing'?'listing':'article',body:'Extracted text '.repeat(30)}});
 await expect(router(claim)).rejects.toMatchObject({code:'CHALLENGE_REQUIRED'});expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it('private extraction of an undated article leaves the publication date unknown',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,fetcher:async()=>new Response('<html>Unstructured article</html>'),extractHtml:async()=>({body:'Article content. '.repeat(30),title:'Actual article'})});
 const claim=(await claimAcquisition(store,jobId,now))!;delete claim.input.observation.publishedAtHint;
 const acquired=await router(claim);expect(acquired.publishedAt).toBeUndefined();expect(acquired.representation).toBe('FULL_ARTICLE');
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

it('duplicate deliveries observing an active lease are read-only and cannot fence the owner',async()=>{
 const claimed=(await claimAcquisition(store,jobId,now))!;const before=await store.snapshot('feed-source-1');
 for(let i=0;i<3;i++)expect(await claimAcquisition(store,jobId,now)).toBeUndefined();
 expect((await store.snapshot('feed-source-1')).epoch).toBe(before.epoch);
 await persistAcquisitionResult(store,claimed,content(claimed.candidate.id),now);
});

it('known monetary admission denial remains durable resource waiting without exhausting acquisition attempts',async()=>{
 await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('BUDGET_EXHAUSTED',false)});
 const job=(await store.read<DownstreamJob>('jobs',jobId))!.value;
 expect(job).toMatchObject({state:'PENDING',exhausted:false,failureCode:'BUDGET_EXHAUSTED',attempts:0});
 expect(job.nextAttemptAt).toBeDefined();expect(await claimAcquisition(store,jobId,now)).toBeUndefined();
});

it('admits a URL-only discovery recheck without replacing complete canonical article evidence',async()=>{
 await runAcquisitionJob(store,jobId,testPolicy,async claim=>({...content(claim.candidate.id),representation:'FULL_ARTICLE',body:'Retained complete article.'}));
 const prior=(await store.list<any>('revisions','feed-source-1'))[0];
 const request=batchFixture(2),o=request.observations[0],p=request.proposals[0];
 o.representation='LISTING_RESULT';o.contentCompleteness='UNKNOWN';delete o.suppliedPayloadRef;delete o.contentHash;
 p.representation=o.representation;p.contentCompleteness=o.contentCompleteness;delete p.suppliedPayloadRef;delete p.payloadHash;
 const receipt=await createCandidateIntakePort(store,testPolicy).acceptBatch(request);
 expect(receipt.receipts[0].decision).toBe('ACCEPTED');
 expect(await store.list('revisions','feed-source-1')).toEqual([prior]);
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response(`<link rel="canonical" href="${o.canonicalUrl}"><meta property="article:published_time" content="2026-10-03T10:00:00Z"><article><h1>Updated development</h1><p>Parliament approved the banking reform.</p></article>`)});
 expect(await runAcquisitionJob(store,JSON.stringify(['ACQUIRE',o.id,'']),testPolicy,router)).toBe('DONE');
 const acquired=(await store.list<AcceptedAcquiredContent>('acquired','feed-source-1')).find(c=>c.sourceObservationId===o.id)!;
 expect(acquired).toMatchObject({representation:'FULL_ARTICLE',acquisitionMethod:'direct_http',body:expect.stringContaining('Parliament approved')});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(2);
});

it('URL-only discovery never authorizes a weaker acquired representation to replace a full article',async()=>{
 await runAcquisitionJob(store,jobId,testPolicy,async claim=>({...content(claim.candidate.id),representation:'FULL_ARTICLE',body:'Retained complete article.'}));
 const before=await store.list('revisions','feed-source-1'),r=batchFixture(2),o=r.observations[0],p=r.proposals[0];
 o.representation='LISTING_RESULT';o.contentCompleteness='UNKNOWN';delete o.suppliedPayloadRef;delete o.contentHash;
 p.representation=o.representation;p.contentCompleteness=o.contentCompleteness;delete p.suppliedPayloadRef;delete p.payloadHash;
 expect((await createCandidateIntakePort(store,testPolicy).acceptBatch(r)).receipts[0].decision).toBe('ACCEPTED');
 await runAcquisitionJob(store,JSON.stringify(['ACQUIRE',o.id,'']),testPolicy,async claim=>({...content(claim.candidate.id),id:'content-2',sourceObservationId:o.id,representation:'LISTING_RESULT',contentCompleteness:'UNKNOWN',body:'Only a listing hint.'}));
 expect(await store.list('revisions','feed-source-1')).toEqual(before);
 const receipts=await store.list<any>('evidence_receipts','feed-source-1');
 expect(receipts.find(r=>r.sourceObservationId===o.id)?.decision).toBe('QUARANTINED_REVISION_CONFLICT');
});
