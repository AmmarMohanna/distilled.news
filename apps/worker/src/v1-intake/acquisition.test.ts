import { afterEach, beforeEach, expect, it } from 'vitest';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy, scopeFixture } from './test-utils';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { claimAcquisition, persistAcquisitionResult, completeAcquisition, runAcquisitionJob, AcquisitionFailure,authorizeAcquisitionRecovery } from './acquisition';
import type { AcceptedAcquiredContent, DownstreamJob } from './types';
import { createCandidateAcquisitionRouter } from './acquisition-router';
import { hashContent,sha256 } from '@distilled/contracts';
import {SourceProviderError} from '@distilled/connectors';
import {V1FeedStore,FeedTransaction} from '../v1-intelligence/store';
import {feedFixture} from '../v1-intelligence/test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
const jobId=JSON.stringify(['ACQUIRE','observation-1','']);
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture())});
afterEach(async()=>ctx.dispose());
const now='2026-10-03T12:00:00Z',later='2026-10-03T12:02:00Z';
it('resolves a Google listing at acquisition while retaining observation identity',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,listing='https://news.google.com/rss/articles/encoded',publisher='https://publisher.example/news/report';
 claim.input.observation={...claim.input.observation,canonicalUrl:listing,representation:'LISTING_RESULT'};
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,resolveGoogleArticle:async url=>({inputUrl:url,url:publisher}),publicGet:async url=>{expect(url).toBe(publisher);return {url,body:'<html><head><meta property="article:published_time" content="2026-10-03T11:00:00Z"></head><body><article><h1>Report</h1><p>Parliament approved banking legislation after a lengthy debate. Presidential approval is still required before the measure becomes law. Officials said the vote followed consultations with local banking representatives and consumer protection organizations.</p></article></body></html>',contentType:'text/html',status:200}}});
 const result=await router(claim);expect(result.canonicalUrl).toBe(publisher);expect(result.sourceObservationId).toBe('observation-1');expect(claim.input.observation.canonicalUrl).toBe(listing);
},30000);
it.each([undefined,{inputUrl:'https://other.example',url:'https://publisher.example/report'},{inputUrl:'https://news.google.com/rss/articles/encoded',url:'http://127.0.0.1/private'}])('never scrapes or pays for unresolved or unsafe Google targets: %j',async decoded=>{
 const claim=(await claimAcquisition(store,jobId,now))!;claim.input.observation={...claim.input.observation,canonicalUrl:'https://news.google.com/rss/articles/encoded',representation:'LISTING_RESULT'};
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,resolveGoogleArticle:async()=>decoded,publicGet:async()=>{calls++;throw Error('must not scrape')},articleFallback:async()=>{calls++;throw Error('must not pay')}});
 await expect(router(claim)).rejects.toBeInstanceOf(AcquisitionFailure);expect(calls).toBe(0);
},30000);
async function terminalRecoveryFixture(failureCode='NETWORK',attempts=5){
 const row=(await store.read<DownstreamJob>('jobs',jobId))!;
 await store.commit(await store.snapshot(row.feedSourceId),[{table:'jobs',id:jobId,value:{...row.value,state:'FAILED',exhausted:true,attempts,failureCode,failureDetail:'HELPER_TRANSPORT_FAILURE'}}]);
}
it('operator recovery grants one attempt and retains cumulative attempts and failure history',async()=>{
 await terminalRecoveryFixture();
 const before=(await store.snapshot('feed-source-1')).epoch;
 await authorizeAcquisitionRecovery(store,jobId,'qa-fix-1',now);
 expect((await store.snapshot('feed-source-1')).epoch).toBeGreaterThan(before);
 await authorizeAcquisitionRecovery(store,jobId,'qa-fix-1',now);
 const reopened=(await store.read<DownstreamJob>('jobs',jobId))!.value;
 expect(reopened).toMatchObject({state:'PENDING',attempts:5,recoveryAuthorizations:[{id:'qa-fix-1',priorAttempts:5,priorFailureCode:'NETWORK',maxAttempts:6}]});
 expect(await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('NETWORK',true)})).toBe('FAILED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'FAILED',attempts:6,exhausted:true});
});
it('operator recovery after an early extraction failure grants exactly one attempt',async()=>{
 await terminalRecoveryFixture('EXTRACTION_FAILED',1);await authorizeAcquisitionRecovery(store,jobId,'qa-fix-1',now);
 expect(await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('NETWORK',true)})).toBe('FAILED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value.attempts).toBe(2);
});
it('recovers a competing job after the original paid request has completed and its response is retained',async()=>{
 await terminalRecoveryFixture('UNCERTAIN_PAID_SUBMISSION');const row=(await store.read<DownstreamJob>('jobs',jobId))!;
 await store.commit(await store.snapshot(row.feedSourceId),[{table:'jobs',id:jobId,value:{...row.value,failureDetail:'ARTICLE_PROVIDER_OUTCOME_UNCERTAIN'}}]);
 await ctx.db.exec('CREATE TABLE connector_provider_operations(feed_source_id TEXT,status INTEGER,payload_ref TEXT,headers TEXT,operation_id TEXT)');
 await ctx.db.prepare('INSERT INTO connector_provider_operations VALUES(?,200,?,NULL,?)').bind(row.feedSourceId,'retained-response','other-job').run();
 await authorizeAcquisitionRecovery(store,jobId,'active-owner-finished',now);
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:5,recoveryAuthorizations:[{priorFailureCode:'UNCERTAIN_PAID_SUBMISSION',maxAttempts:6}]});
});
it.each(['CHALLENGE_REQUIRED','BODY_BUDGET_EXCEEDED'])('operator recovery preserves %s history after a route repair',async code=>{
 await terminalRecoveryFixture(code,1);await authorizeAcquisitionRecovery(store,jobId,'route-fix',now);
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:1,recoveryAuthorizations:[{priorFailureCode:code,maxAttempts:2}]});
});
it('requires exact public redirect evidence to recover a historical redirect policy failure',async()=>{
 await terminalRecoveryFixture('POLICY_DENIED',1);
 const row=(await store.read<DownstreamJob>('jobs',jobId))!;await store.commit(await store.snapshot(row.feedSourceId),[{table:'jobs',id:jobId,value:{...row.value,failureDetail:undefined}}]);
 const input=(await store.read<any>('inputs','observation-1'))!.value,from=input.observation.canonicalUrl;
 await expect(authorizeAcquisitionRecovery(store,jobId,'route-fix',now,{from,to:'https://127.0.0.1/private'})).rejects.toThrow('RECOVERY_FAILURE_NOT_ELIGIBLE');
 await expect(authorizeAcquisitionRecovery(store,jobId,'route-fix',now,{from:from+'/other',to:'https://idp.example/authorize'})).rejects.toThrow('RECOVERY_FAILURE_NOT_ELIGIBLE');
 await authorizeAcquisitionRecovery(store,jobId,'route-fix',now,{from,to:'https://idp.example/authorize'});
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',recoveryAuthorizations:[{priorFailureCode:'POLICY_DENIED',redirectEvidence:{from,to:'https://idp.example/authorize'}}]});
});
it.each(['AUTH_REQUIRED','POLICY_DENIED','UNCERTAIN_PAID_SUBMISSION','INVALID_RESULT'])('operator recovery refuses %s',async code=>{
 await terminalRecoveryFixture(code);await expect(authorizeAcquisitionRecovery(store,jobId,'qa-fix-1',now)).rejects.toThrow('RECOVERY_FAILURE_NOT_ELIGIBLE');
});
it('operator recovery refuses unresolved paid work and leaves the terminal job untouched',async()=>{
 await terminalRecoveryFixture();
 await ctx.db.exec('CREATE TABLE connector_provider_operations(feed_source_id TEXT,status INTEGER,payload_ref TEXT,headers TEXT)');
 await ctx.db.prepare('INSERT INTO connector_provider_operations VALUES(?,NULL,NULL,NULL)').bind('feed-source-1').run();
 await expect(authorizeAcquisitionRecovery(store,jobId,'qa-fix-1',now)).rejects.toThrow('RECOVERY_PAID_OUTCOME_UNRESOLVED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'FAILED',attempts:5});
});
it('can authorize a waiting job while another request owns a finite active claim',async()=>{
 await terminalRecoveryFixture('CHALLENGE_REQUIRED',1);
 await ctx.db.exec('CREATE TABLE connector_provider_operations(feed_source_id TEXT,status INTEGER,payload_ref TEXT,headers TEXT)');
 await ctx.db.prepare('INSERT INTO connector_provider_operations VALUES(?,-1,NULL,?)').bind('feed-source-1',JSON.stringify({claimToken:'active-owner',claimExpiresAt:'2026-10-03T12:01:00.000Z'})).run();
 await authorizeAcquisitionRecovery(store,jobId,'route-fix',now);expect((await store.read<DownstreamJob>('jobs',jobId))!.value.state).toBe('PENDING');
});
it('reports a restricted teaser as access-required and avoids paid recovery',async()=>{
 let calls=0;
 const html='<script type="application/ld+json">{"@type":"WebPage","isAccessibleForFree":false}</script><h1>Story</h1><main><p>Teaser only.</p><div id="paywall-prompt"></div><h2><a href="/one">One</a></h2><h2><a href="/two">Two</a></h2></main>';
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response(html),articleFallback:async()=>{calls++;return undefined}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('FAILED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({failureCode:'AUTH_REQUIRED',failureDetail:'ARTICLE_ACCESS_RESTRICTED'});
 expect(calls).toBe(0);expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it('retains an upstream failure origin returned through the HTTP helper',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:403}),publicArticle:async()=>({status:503,failureOrigin:'upstream_http'})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({failureCode:'NETWORK',failureDetail:'UPSTREAM_SERVER_ERROR',httpStatus:503});
});
it('the bounded fallback lease prevents a second owner during a long article chain',async()=>{
 const claimed=await claimAcquisition(store,jobId,now,180000);expect(claimed?.job.leaseUntil).toBe('2026-10-03T12:03:00.000Z');
 expect(await claimAcquisition(store,jobId,later)).toBeUndefined();
});
it('RSS article helper failure reaches the rendering chain and persists the original date and identity',async()=>{
 let calls=0;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:406}),publicArticle:async()=>{throw Error('SOURCE_EXECUTION_TIMEOUT')},
  articleFallback:async claim=>{calls++;return {status:200,url:claim.input.observation.canonicalUrl,pageKind:'article',body:'The publisher reports a decision. '.repeat(30),provider:'website_zyte',dateMetadata:{publishedAt:'2026-08-31T10:00:00Z',candidates:[],publicationConflict:false}}}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('DONE');expect(calls).toBe(1);
 expect((await store.list<AcceptedAcquiredContent>('acquired','feed-source-1'))[0]).toMatchObject({acquisitionProvider:'website_zyte',publishedAt:'2026-08-31T10:00:00.000Z',contentCompleteness:'UNKNOWN'});
});
it.each([401,429,451,404])('public article status %s does not invoke rendering or paid fallback',async status=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status}),articleFallback:async()=>{calls++;return undefined}});
 await runAcquisitionJob(store,jobId,testPolicy,router);expect(calls).toBe(0);
});
it('an uncertain Zyte submission is terminal and cannot be retried by another acquisition delivery',async()=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:406}),articleFallback:async()=>{calls++;throw new SourceProviderError('UNCERTAIN_PAID_SUBMISSION')}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('FAILED');
 expect(await runAcquisitionJob(store,jobId,{...testPolicy,now:()=>later},router)).toBe('SKIPPED');expect(calls).toBe(1);
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value.failureCode).toBe('UNCERTAIN_PAID_SUBMISSION');
});
it('helper capacity waits preserve retry allowance and respect the provider deadline',async()=>{
 await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('BACKPRESSURE',true,{detail:'HELPER_CAPACITY_WAIT',retryNotBefore:'2026-10-03T12:05:00Z'})});
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:0,resourceWaits:1,failureDetail:'HELPER_CAPACITY_WAIT',nextAttemptAt:'2026-10-03T12:05:00.000Z'});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it('private article helper backpressure survives routing without consuming a provider attempt',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,publicGet:async url=>({url,body:'Blocked',contentType:'text/html',status:403}),publicArticle:async()=>{throw new SourceProviderError('BACKPRESSURE','2026-10-03T12:05:00Z')}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:0,resourceWaits:1,failureCode:'BACKPRESSURE',failureDetail:'HELPER_CAPACITY_WAIT'});
});
it('missing articles retain their HTTP status and terminal reason',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,publicGet:async url=>({url,body:'Not found',contentType:'text/html',status:404})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('FAILED');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({failureCode:'UNSUPPORTED',failureDetail:'HTTP_NOT_FOUND',httpStatus:404});
});
it('a public 406 retains bounded retries and never invokes browser or model escalation',async()=>{
 let calls=0;
 const router=createCandidateAcquisitionRouter({now:()=>now,publicGet:async url=>({url,body:'Not acceptable',contentType:'text/html',status:406}),stages:{webOperator:async()=>{calls++;throw Error('Must not escalate a 406')}}});
 for(let attempt=1;attempt<=5;attempt++){
  const at=new Date(Date.parse(now)+attempt*3600000).toISOString();
  expect(await runAcquisitionJob(store,jobId,{...testPolicy,now:()=>at},router)).toBe(attempt<5?'RETRY':'FAILED');
  expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:attempt<5?'PENDING':'FAILED',attempts:attempt,failureCode:'NETWORK',failureDetail:'UPSTREAM_NOT_ACCEPTABLE',httpStatus:406,exhausted:attempt===5});
 }
 expect(calls).toBe(0);expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it.each(['wrong-url','listing','private-denied'])('a public 406 never promotes an invalid fallback: %s',async kind=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:406}),publicArticle:async()=>kind==='private-denied'?{status:406}:{status:200,url:kind==='wrong-url'?url+'/other':url,pageKind:kind==='listing'?'listing':'article',body:'Article text. '.repeat(30)}});
 await expect(router(claim)).rejects.toMatchObject({code:'NETWORK',transient:true,diagnostic:{httpStatus:406,detail:'UPSTREAM_NOT_ACCEPTABLE'}});
 expect(await store.list('revisions','feed-source-1')).toHaveLength(0);
});
it('upstream Retry-After overrides the local acquisition retry backoff',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,publicGet:async url=>({url,body:'Wait',contentType:'text/html',status:429,retryAfter:'600'})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({failureCode:'RATE_LIMIT',httpStatus:429,nextAttemptAt:'2026-10-03T12:10:00.000Z'});
});
function content(candidateId:string):AcceptedAcquiredContent {return {id:'content-1',feedId:'feed-1',candidateId,sourceObservationId:'observation-1',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'A development',acquiredAt:now,acquisitionMethod:'supplied_payload'}}
it('claims and downloads use the observation lease while only evidence promotion takes Feed admission',async()=>{
 let admitted=false,phases=0;
 const admission={run:async<T>(run:()=>Promise<T>):Promise<T>=>{expect(admitted).toBe(false);admitted=true;phases++;try{return await run()}finally{admitted=false}},isBusy:()=>false};
 expect(await runAcquisitionJob(store,jobId,testPolicy,async claim=>{expect(admitted).toBe(false);return content(claim.candidate.id)},admission)).toBe('DONE');
 expect(phases).toBe(1);expect(admitted).toBe(false);
});
it('repeated completion admission waits retain fetched bytes and consume no recovery attempts',async()=>{
 const busy=new Error('capacity');let calls=0;
 const execute=async(claim:Awaited<ReturnType<typeof claimAcquisition>>)=>{calls++;return content(claim!.candidate.id)};
 const admission={run:async<T>(_run:()=>Promise<T>):Promise<T>=>{throw busy},isBusy:(error:unknown)=>error===busy};
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
it('immutable fetched-result journaling preserves canonical scope epoch and still fences replaced acquisition leases',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;
 const epoch=(await store.snapshot(claim.job.feedSourceId)).epoch;
 await persistAcquisitionResult(store,claim,content(claim.candidate.id),now);
 expect((await store.snapshot(claim.job.feedSourceId)).epoch).toBe(epoch);
 const replacement=(await claimAcquisition(store,jobId,later))!;
 expect(replacement.token).not.toBe(claim.token);
 await expect(persistAcquisitionResult(store,claim,content(claim.candidate.id),later)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
});
it('acquisition claims and immutable result storage do not invalidate an unrelated Feed review snapshot',async()=>{
 const feedStore=new V1FeedStore(ctx.db);await feedStore.registerFeed({...feedFixture,id:'feed-1'});
 const snapshot=await feedStore.snapshot('feed-1'),claim=(await claimAcquisition(store,jobId,now))!;
 await persistAcquisitionResult(store,claim,content(claim.candidate.id),now);
 const tx=new FeedTransaction(feedStore,snapshot);await tx.write('intelligence_receipts','independent-review',{id:'independent-review',feedId:'feed-1'});
 expect(await feedStore.commit(tx)).toBe(true);
});
it('a replacement claim between lease validation and result commit is fenced by job CAS even without an epoch bump',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,commit=store.commit.bind(store);let raced=false;
 store.commit=async(snapshot,writes,guards)=>{
  if(!raced&&writes.some(w=>w.table==='acquisition_results')){raced=true;expect(await claimAcquisition(store,jobId,later)).toBeDefined();}
  return commit(snapshot,writes,guards);
 };
 await expect(persistAcquisitionResult(store,claim,content(claim.candidate.id),now)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 expect(await store.read('acquisition_results',jobId)).toBeUndefined();
});
it('terminal acquisition failure still changes the canonical coverage epoch',async()=>{
 const before=(await store.snapshot('feed-source-1')).epoch;
 expect(await runAcquisitionJob(store,jobId,testPolicy,async()=>{throw new AcquisitionFailure('UNSUPPORTED',false)})).toBe('FAILED');
 expect((await store.snapshot('feed-source-1')).epoch).toBeGreaterThan(before);
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
it.each([403,406,408,425,500,502,503,504])('an anonymous private HTTP fallback retrieves an exact RSS article after a public %s',async status=>{
 let privateCalls=0;
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,fetcher:async()=>new Response('Rejected',{status}),
  publicArticle:async exact=>{privateCalls++;expect(exact).toBe(url);return {status:200,url:exact,pageKind:'article',body:'Publisher article text. '.repeat(25),title:'Decision',publishedAt:'2026-10-03T10:00:00Z',dateMetadata:{publishedAt:'2026-10-03T10:00:00Z',publicationConflict:false,candidates:[{value:'2026-10-03T10:00:00Z',source:'html:article:published_time'}]}}}});
 const acquired=await router(claim);expect(privateCalls).toBe(1);expect(acquired).toMatchObject({representation:'FULL_ARTICLE',canonicalUrl:url,publishedAt:'2026-10-03T10:00:00.000Z',acquisitionProvider:'private_public_http'});
});
it('a public transport failure can recover through the anonymous exact-URL fallback',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,url=claim.input.observation.canonicalUrl!;
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>{throw new TypeError('fetch failed')},publicArticle:async()=>({status:200,url,pageKind:'article',body:'Publisher reporting. '.repeat(30)})});
 expect(await router(claim)).toMatchObject({canonicalUrl:url,acquisitionProvider:'private_public_http',contentCompleteness:'UNKNOWN'});
});
it.each([408,425,503])('public %s without a usable fallback remains retryable',async status=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',failureCode:'NETWORK',httpStatus:status});
});
it('a temporary helper server failure is recorded as retryable instead of a permanent challenge',async()=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:403}),publicArticle:async()=>({status:502,error:'UNAVAILABLE'})});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',failureCode:'NETWORK',failureDetail:'HELPER_TRANSIENT_FAILURE'});
});
it.each(['SOURCE_EXECUTION_TIMEOUT','SOURCE_EXECUTION_UNAVAILABLE'])('helper %s schedules a durable retry instead of leaving its lease running',async message=>{
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status:406}),publicArticle:async()=>{throw new Error(message)}});
 expect(await runAcquisitionJob(store,jobId,testPolicy,router)).toBe('RETRY');
 expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',failureCode:'NETWORK',failureDetail:'HELPER_TRANSPORT_FAILURE'});
});
it.each([401,429,451])('status %s never invokes the anonymous fallback',async status=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('',{status}),publicArticle:async()=>{calls++;throw Error('must not call')}});
 const claim=(await claimAcquisition(store,jobId,now))!;
 await expect(router(claim)).rejects.toMatchObject({code:status===401?'AUTH_REQUIRED':status===429?'RATE_LIMIT':'POLICY_DENIED'});expect(calls).toBe(0);
});
it.each([403,406])('a %s carrying WWW-Authenticate remains an authentication requirement',async status=>{
 let calls=0;const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response('Login',{status,headers:{'www-authenticate':'Basic realm="private"'}}),publicArticle:async()=>{calls++;throw Error('must not call')}});
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

it('acquires a complete WordPress post without calling an unavailable helper and retains final qualifiers',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!,o=claim.input.observation;
 o.canonicalUrl='https://example.com/news/post/';
 const text='The company allocated 5 percent of shares. '.repeat(6),last='An additional contribution remains optional, not promised.';
 const router=createCandidateAcquisitionRouter({now:()=>now,fetcher:async()=>new Response(`<link rel="canonical" href="${o.canonicalUrl}"><meta property="og:type" content="article"><meta property="article:published_time" content="2026-10-03T10:00:00Z"><h1>Fund announcement</h1><div class="entry-content wp-block-post-content"><p>${text}</p><div><p>${last}</p></div></div>`),extractHtml:async()=>{throw Error('UNAVAILABLE_HELPER_MUST_NOT_BE_CALLED')}});
 const acquired=await router(claim);expect(acquired).toMatchObject({representation:'FULL_ARTICLE',contentCompleteness:'COMPLETE',canonicalUrl:o.canonicalUrl,acquisitionMethod:'direct_http'});expect(acquired.body).toContain(last);expect(acquired.body).toContain('5 percent');
});
it('Google resolution preserves approval denial without scraping or paying',async()=>{
 const claim=(await claimAcquisition(store,jobId,now))!;claim.input.observation={...claim.input.observation,canonicalUrl:'https://news.google.com/rss/articles/encoded',representation:'LISTING_RESULT'};
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,resolveGoogleArticle:async()=>{throw new AcquisitionFailure('POLICY_DENIED',false)}});
 await expect(router(claim)).rejects.toMatchObject({code:'POLICY_DENIED',transient:false});
},30000);
it.each([false,true])('operator recovery distinguishes a reconciled other-job hold from its own lost paid result: %s',async own=>{
 await terminalRecoveryFixture('UNCERTAIN_PAID_SUBMISSION');const row=(await store.read<DownstreamJob>('jobs',jobId))!;
 await store.commit(await store.snapshot(row.feedSourceId),[{table:'jobs',id:jobId,value:{...row.value,failureDetail:'ARTICLE_PROVIDER_OUTCOME_UNCERTAIN'}}]);
 const input=(await store.read<any>('inputs',row.value.observationId))!.value,o=input.observation;
 const operationId=own?await sha256(JSON.stringify([{feedId:o.feedId,feedSourceId:o.feedSourceId,sourceId:o.sourceId},JSON.stringify(['article-fallback-v1',jobId,o.canonicalUrl])])):'different-job';
 await ctx.db.exec('CREATE TABLE connector_provider_operations(feed_source_id TEXT,status INTEGER,payload_ref TEXT,headers TEXT,operation_id TEXT)');
 await ctx.db.prepare('INSERT INTO connector_provider_operations VALUES(?,200,NULL,?,?)').bind(o.feedSourceId,JSON.stringify({reconciliation:{kind:'COMPLETED_RESPONSE_LOST',requestId:'verified-provider-receipt'}}),operationId).run();
 if(own){await expect(authorizeAcquisitionRecovery(store,jobId,'qa-receipt',now)).rejects.toThrow('RECOVERY_PAID_RESULT_LOST');expect((await store.read<DownstreamJob>('jobs',jobId))!.value.state).toBe('FAILED')}
 else{await authorizeAcquisitionRecovery(store,jobId,'qa-receipt',now);expect((await store.read<DownstreamJob>('jobs',jobId))!.value).toMatchObject({state:'PENDING',attempts:5,recoveryAuthorizations:[{priorFailureCode:'UNCERTAIN_PAID_SUBMISSION'}]})}
},30000);
