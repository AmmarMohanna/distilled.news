import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {createCandidateAcquisitionRouter} from '../v1-intake/acquisition-router';
import {AcquisitionFailure,runAcquisitionJob} from '../v1-intake/acquisition';
import type {DownstreamJob} from '../v1-intake/types';
import {withIntelligenceTurn} from '../connector-intelligence-turn';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {processV1Briefing,processV1Reassessment,windowIdentity,type BriefingRequest} from './runtime';
import {prepareV3Window} from './v3-window';
import {publicV1Edition,publicV1Editions,withdrawV1Edition} from './public-read';
import {CLOCK_PREPARATION_POLICY,livePublicationWindow} from './schedule';
import {observeWindowReadiness} from './window-readiness';
import {createApp} from '../app';
import {createSession} from '../auth';
import {D1Repository} from '../repository';
import type {Env} from '../types';

const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
const acquiredAt='2026-10-03T12:25:00Z',jobId=JSON.stringify(['ACQUIRE','observation-1','']);
const text='Parliament approved banking reform legislation after a lengthy debate. '.repeat(130)+'Presidential approval is still required; the measure has not taken effect.';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,intake:V1IntakeStore,env:Env;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true,archive:true});intake=new V1IntakeStore(ctx.db);store=new V1FeedStore(ctx.db);
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','integration@example.invalid','integration@example.invalid','integration-owner','user','hash','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','integration','Integration','banking reform',1,'2026-10-03','2026-10-03');");

 await ctx.db.prepare("INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,enabled,collection_owner,last_seen_at,created_at,updated_at) VALUES('feed-source-1','feed-1','Telegram','channel','telegram','telegram_channel','https://t.me/example',1,'connector',?,?,?)").bind(window.start,window.start,window.start).run();
 await seedIntakeScope(intake);await store.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
 const batch=batchFixture();batch.observations[0].publishedAtHint='2026-10-03T12:20:00Z';batch.proposals[0].publishedAtHint='2026-10-03T12:20:00Z';
 batch.coverage.createdAt=batch.observations[0].observedAt=batch.proposals[0].discoveredAt='2026-10-03T12:24:00Z';
 await createCandidateIntakePort(intake,{...testPolicy,now:()=>acquiredAt}).acceptBatch(batch);
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_REVIEW_PREPARATION_ISOLATED:'true',V1_PUBLICATION_PREPARATION_ISOLATED:'true',BRIEFING_ENGINE:'v3',BRIEFING_EDITOR_MODEL:'openai/gpt-4.1',BRIEFING_VERIFIER_MODEL:'openai/gpt-4.1-mini',OPENROUTER_API_KEY:'test-only-key'} as Env;
});
afterEach(async()=>ctx.dispose());
async function acquire(publishedAt:string,body=text,now=acquiredAt){
 const router=createCandidateAcquisitionRouter({now:()=>now,preferFullArticle:true,fetcher:async()=>new Response(`<meta property="article:published_time" content="${publishedAt}"><meta property="article:modified_time" content="2026-10-03T12:20:00Z"><h1>Banking reform</h1><article>${body}</article>`)});
 return runAcquisitionJob(intake,jobId,{...testPolicy,now:()=>now},router);
}
async function separateBudgetWait(){
 const job={id:'waiting-acquisition',feedId:'feed-1',feedSourceId:'feed-source-1',observationId:'waiting-observation',kind:'ACQUIRE',state:'PENDING',exhausted:false,failureCode:'BUDGET_EXHAUSTED',failureDetail:'ARTICLE_PROVIDER_BUDGET',attempts:1,resourceWaits:288,nextAttemptAt:'2026-10-03T13:00:00Z'};
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('waiting-observation','feed-source-1',JSON.stringify({observation:{observedAt:'2026-10-03T11:20:00Z'}})).run();
 await ctx.db.prepare('INSERT INTO v1_jobs(id,feed_source_id,json) VALUES(?,?,?)').bind(job.id,'feed-source-1',JSON.stringify(job)).run();
 return job;
}
async function continuingTelegram(){
 const result={state:'HANDED_OFF',checkpoint:'UNCHANGED',request:{coverage:{createdAt:window.end},observations:[{id:'later',observedAt:window.end}]},response:{durable:true,receipts:[{observationId:'later',checkpointResolution:'RESOLVED'}]}};
 await ctx.db.prepare('INSERT INTO connector_provider_poll_jobs(job_id,request,initial_hash,provider_order,due_at,scheduled_at,result) VALUES(?,?,?,?,?,?,?)').bind('later-poll',JSON.stringify({scope:{feedId:'feed-1',feedSourceId:'feed-source-1'},source:{family:'telegram'},requestedBounds:{}}),'fixture','[]',window.end,window.start,JSON.stringify(result)).run();
}
it.each(['continuing','capacity'] as const)('defers an empty window without inference when collection is incomplete (%s)',async mode=>{
 expect(await acquire('2026-08-31T10:00:00Z')).toBe('DONE');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),acquiredAt);
 await continuingTelegram();let calls=0;
 if(mode==='capacity')await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET result=NULL,last_error='BACKPRESSURE' WHERE job_id='later-poll'").run();
 await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'feed-1',window},()=>processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>mode==='capacity'?'2026-10-03T12:35:00Z':window.end,undefined,(async()=>{calls++;throw Error('unexpected inference')}) as typeof fetch));
 const request=(await store.list<any>('feed-1','briefing_requests'))[0];
 expect(request).toMatchObject({state:'DONE',result:'DEFERRED',reason:'INCOMPLETE_INTAKE_COVERAGE',coverage:{state:'INCOMPLETE',failures:[{kind:'COLLECTION',code:mode==='capacity'?'COLLECTION_BACKPRESSURE_AT_DEADLINE':'COLLECTION_CONTINUING_AFTER_CUTOFF',count:1}]}});
 expect(calls).toBe(0);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await ctx.db.prepare("SELECT state FROM connector_provider_poll_jobs WHERE job_id='later-poll'").first()).toEqual({state:'PENDING'});
 if(mode==='capacity'){
  const late=batchFixture(2);late.observations[0].sourceItemKey=late.proposals[0].sourceItemKey='late-story';
  late.coverage.createdAt=late.observations[0].observedAt=late.proposals[0].discoveredAt='2026-10-03T12:36:00Z';
  late.observations[0].publishedAtHint=late.proposals[0].publishedAtHint='2026-10-03T12:15:00Z';
  await createCandidateIntakePort(intake,{...testPolicy,now:()=> '2026-10-03T12:36:00Z'}).acceptBatch(late);
  const router=createCandidateAcquisitionRouter({now:()=> '2026-10-03T12:37:00Z',preferFullArticle:true,fetcher:async()=>new Response(`<meta property="article:published_time" content="2026-10-03T12:15:00Z"><h1>Recovered story</h1><article>${text}</article>`)});
  expect(await runAcquisitionJob(intake,JSON.stringify(['ACQUIRE','observation-2','']),{...testPolicy,now:()=> '2026-10-03T12:37:00Z'},router)).toBe('DONE');
  await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-2','']),'2026-10-03T12:38:00Z');
  const next={...window,start:window.end,end:'2026-10-03T13:00:00Z'};
  const prepared=await prepareV3Window(store,'feed-1',next,next.end);
  expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0]).toMatchObject({text,publishedAt:'2026-10-03T12:15:00.000Z'});
  expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'DEFERRED',window});
 }
},30000);
it('still waits for unfinished pre-cutoff acquisition when a later collection page is releasable',async()=>{
 await continuingTelegram();let calls=0;
 await withIntelligenceTurn(env,{type:'v1_briefing',feedId:'feed-1',window},()=>processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,(async()=>{calls++;throw Error('unexpected inference')}) as typeof fetch));
 expect(calls).toBe(0);expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'PENDING',reason:'AWAITING_INTAKE_REASSESSMENT'});
 expect(await store.list('feed-1','v3_window_inputs')).toHaveLength(0);
},30000);
it.each(['complete','continuing','budget-wait','capacity','acquisition-capacity','artifact'] as const)('publishes full acquired evidence with source-owned citations and receipts (%s)',async mode=>{
 const schedule={durationMinutes:30,timezone:'UTC',clockStartAt:'2026-10-03T11:00:00Z',clockPolicy:CLOCK_PREPARATION_POLICY} as const;
 const reporting=mode==='artifact'?livePublicationWindow(schedule,new Date('2026-10-03T12:25:00Z')):window;
 if(mode==='artifact')await store.registerFeed({...feedFixture,revision:2,createdAt:schedule.clockStartAt,briefingFrequency:'30M',briefingSchedule:schedule});
 const acceptedAt=mode==='artifact'?'2026-10-03T12:24:45Z':acquiredAt;
 expect(await acquire('2026-10-03T12:05:00Z',text,acceptedAt)).toBe('DONE');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),acceptedAt);
 if(mode==='continuing')await continuingTelegram();
 if(mode==='capacity'){await continuingTelegram();await ctx.db.prepare("UPDATE connector_provider_poll_jobs SET result=NULL,last_error='BACKPRESSURE' WHERE job_id='later-poll'").run();}
 let waitingJob=mode==='budget-wait'||mode==='acquisition-capacity'?await separateBudgetWait():undefined;
 if(mode==='acquisition-capacity'){waitingJob={...waitingJob!,failureCode:'BACKPRESSURE',failureDetail:'HELPER_LOCAL_CAPACITY_BUSY'};await ctx.db.prepare('UPDATE v1_jobs SET json=? WHERE id=?').bind(JSON.stringify(waitingJob),waitingJob.id).run();}
 expect(await store.list('feed-1','events')).toHaveLength(0);expect(await store.list('feed-1','claim_mentions')).toHaveLength(0);
 const prepared=await prepareV3Window(store,'feed-1',reporting,reporting.end);
 expect(prepared.input.articles[0].text).toBe(text);expect(text.length).toBeGreaterThan(6000);
 const calls:{model:string;prompt:string}[]=[];
 const fetcher=(async(_url,init)=>{
  const request=JSON.parse(init!.body as string),prompt=JSON.stringify(request.messages);calls.push({model:request.model,prompt});
  const verify=request.messages[0].content.includes('meticulous fact-checker');
  const content=verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Parliament approved banking reform legislation; presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};
  return Response.json({id:`gen-integration-${calls.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 const delivery='scheduledFor' in reporting?reporting.scheduledFor!:'2026-10-03T12:35:00Z';
 const message={type:'v1_briefing' as const,feedId:'feed-1',window:reporting};
 if(mode==='artifact'){
  env={...env,RAW_ARCHIVE:ctx.archive!,EDITION_ARTIFACTS_ENABLED:'true',PRODUCT_FEEDS_ENABLED:'true',ADMIN_SESSION_SECRET:'fixture-only'};
  expect(await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=> '2026-10-03T12:29:00Z',undefined,fetcher))).toBeUndefined();
  expect(await ctx.db.prepare('SELECT edition_id FROM v1_edition_delivery_latest').first()).toBeNull();
  expect(calls).toHaveLength(2);
  const requestId=await windowIdentity('feed-1',reporting);
  const request=await store.read<BriefingRequest>('feed-1','briefing_requests',requestId);
  await observeWindowReadiness({...env,WINDOW_READINESS_MODE:'shadow'},request!,new Date('2026-10-03T12:29:00Z'));
  expect(await ctx.db.prepare('SELECT due_ms FROM v1_window_ready_outbox WHERE window_id=?').bind(requestId).first()).toEqual({due_ms:Date.parse(delivery)});
 }
 const publishAt=mode==='capacity'||mode==='acquisition-capacity'||mode==='artifact'?delivery:'2026-10-03T12:34:00Z';
 const edition=await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=>publishAt,undefined,fetcher));
 expect(edition).toMatchObject({engine:'v3',windowStart:reporting.start,windowEnd:reporting.end});
 expect(calls.map(c=>c.model)).toEqual(['openai/gpt-4.1','openai/gpt-4.1-mini']);
 expect(calls.every(c=>c.prompt.includes('the measure has not taken effect'))).toBe(true);
 expect(edition!.evidenceRevisionIds).toEqual([prepared.input.articles[0].id]);
 expect(edition!.stories[0].claims[0].support).toMatchObject([{evidenceRevisionId:prepared.input.articles[0].id,quote:text}]);
 expect(await publicV1Edition(ctx.db,edition!.id)).toMatchObject({id:edition!.id,citations:[{evidenceRevisionId:prepared.input.articles[0].id,url:prepared.input.articles[0].url,publishedAt:prepared.input.articles[0].publishedAt}]});
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(2);expect(await store.list('feed-1','events')).toHaveLength(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v3_model_spend').first<{n:number}>())?.n).toBe(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())?.n).toBe(2);
 if(mode==='continuing')expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',failures:[{kind:'COLLECTION',code:'COLLECTION_CONTINUING_AFTER_CUTOFF',count:1}]}});
 if(mode==='capacity'){
  expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',unavailableCollections:[{id:'feed-source-1',count:1}],failures:[{kind:'COLLECTION',code:'COLLECTION_BACKPRESSURE_AT_DEADLINE',count:1}]}});
  expect(await ctx.db.prepare("SELECT state,last_error FROM connector_provider_poll_jobs WHERE job_id='later-poll'").first()).toEqual({state:'PENDING',last_error:'BACKPRESSURE'});
 }
 if(waitingJob){
  expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'PUBLISHED',coverage:{state:'INCOMPLETE',pendingJobs:0,failedJobs:1,failures:[{kind:'ACQUIRE',code:mode==='acquisition-capacity'?'ACQUISITION_BACKPRESSURE_AT_DEADLINE':'BUDGET_EXHAUSTED',count:1}]}});
  expect((await intake.read('jobs',waitingJob.id))?.value).toEqual(waitingJob);
  expect(calls.every(c=>!c.prompt.includes('waiting-observation'))).toBe(true);
 }
 expect(await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=> '2026-10-03T12:35:00Z',undefined,fetcher))).toEqual(edition);
 expect(calls).toHaveLength(2);
 if(mode==='artifact')await checkEditionArtifact(edition!.id,delivery);
},30000);

async function checkEditionArtifact(editionId:string,delivery:string){
 const db=ctx.db,bucket=ctx.archive!;
 const ref=await db.prepare(`SELECT d.object_key,a.state,d.published_at FROM v1_edition_delivery_latest l
  JOIN v1_edition_delivery d ON d.edition_id=l.edition_id JOIN v1_verified_archives a ON a.object_key=d.object_key
  WHERE l.feed_id='feed-1' AND d.edition_id=?`).bind(editionId).first<{object_key:string;state:string;published_at:string}>();
 expect(ref).toMatchObject({state:'REFERENCED',published_at:delivery});
 expect(await store.read('feed-1','delivery_jobs',editionId)).toMatchObject({state:'PENDING'});
 const canonical=JSON.parse(JSON.stringify(await publicV1Edition(db,editionId)));
 const object=await bucket.get(ref!.object_key);
 expect(await object?.json()).toEqual(canonical);
 expect(await publicV1Editions(db,'feed-1',undefined,bucket)).toEqual([canonical]);
 const app=createApp(),id=encodeURIComponent(editionId),route=`/api/v1/editions/${id}`;
 await db.prepare("INSERT INTO username_aliases(username,account_id,is_current,created_at) VALUES('integration-owner','owner-1',1,?)").bind(delivery).run();
 const feedRoute='/api/feed/integration-owner/integration';
 const publicResponse=await app.request(route,{},env);
 expect(publicResponse.status).toBe(200);
 expect(publicResponse.headers.get('Cache-Control')).toBe('private, no-store');
 expect(await publicResponse.json()).toEqual(canonical);
 expect((await app.request(`${feedRoute}/editions/${id}`,{},env)).status).toBe(200);
 const owner=(await new D1Repository(db).getAccountById('owner-1'))!;
 const cookie='dn_session='+await createSession(env.ADMIN_SESSION_SECRET!,owner);
 await db.prepare("UPDATE briefings SET public_feed_enabled=0 WHERE id='feed-1'").run();
 for(const path of [route,feedRoute,`${feedRoute}/editions/${id}`,`${feedRoute}/search?q=banking`])
  expect((await app.request(path,{},env)).status).toBe(404);
 expect((await app.request(route,{headers:{cookie}},env)).status).toBe(200);
 await bucket.put(ref!.object_key,'corrupt test fixture');
 expect(await (await app.request(route,{headers:{cookie}},env)).json()).toEqual(canonical);
 await withdrawV1Edition(db,editionId,'owner-1','OWNER_REQUEST',delivery);
 expect(await db.prepare('SELECT edition_id FROM v1_edition_delivery_latest').first()).toBeNull();
 expect((await app.request(route,{headers:{cookie}},env)).status).toBe(404);
 expect(await publicV1Editions(db,'feed-1',undefined,bucket)).toEqual([]);
}
it.each(['budget','capacity'] as const)('defers an empty unavailable window without inference and retains acquisition for late discovery (%s)',async mode=>{
 expect(await runAcquisitionJob(intake,jobId,{...testPolicy,now:()=>acquiredAt},async()=>{throw new AcquisitionFailure(mode==='capacity'?'BACKPRESSURE':'BUDGET_EXHAUSTED',true,{detail:mode==='capacity'?'HELPER_LOCAL_CAPACITY_BUSY':'ARTICLE_PROVIDER_BUDGET'});})).toBe('RETRY');
 const waiting=(await intake.read<DownstreamJob>('jobs',jobId))!.value;
 let calls=0;const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=>mode==='capacity'?'2026-10-03T12:35:00Z':window.end,undefined,(async()=>{calls++;throw Error('No inference for unavailable evidence');}) as typeof fetch));
 expect(calls).toBe(0);
 expect((await store.list<any>('feed-1','briefing_requests'))[0]).toMatchObject({state:'DONE',result:'DEFERRED',reason:'INCOMPLETE_INTAKE_COVERAGE',coverage:{state:'INCOMPLETE',pendingJobs:0,failedJobs:1,failures:[{kind:'ACQUIRE',code:mode==='capacity'?'ACQUISITION_BACKPRESSURE_AT_DEADLINE':'BUDGET_EXHAUSTED',count:1}]}});
 expect((await intake.read<DownstreamJob>('jobs',jobId))?.value).toEqual(waiting);
 expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())?.n).toBe(0);
 expect(await acquire('2026-10-03T12:05:00Z',text,'2026-10-03T12:40:00Z')).toBe('DONE');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:41:00Z');
 const next={...window,start:window.end,end:'2026-10-03T13:00:00Z'};
 const prepared=await prepareV3Window(store,'feed-1',next,next.end);
 expect(prepared.input.articles).toHaveLength(1);
 expect(prepared.input.articles[0]).toMatchObject({text,publishedAt:'2026-10-03T12:05:00.000Z'});
 expect((await intake.read<DownstreamJob>('jobs',jobId))?.value).toMatchObject({id:jobId,state:'DONE'});
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},30000);
it('keeps an old original publication date out of paid V3 admission despite a current collection/update date',async()=>{
 expect(await acquire('2026-08-31T10:00:00Z')).toBe('DONE');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),acquiredAt);
 expect((await prepareV3Window(store,'feed-1',window,window.end)).input.articles).toHaveLength(0);
 let calls=0;const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=>window.end,undefined,(async()=>{calls++;throw Error('No paid call for stale backlog');}) as typeof fetch));
 expect(calls).toBe(0);expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);expect(await store.list('feed-1','editions')).toHaveLength(0);
},30000);
it('does not promote or offer an encoded article tail to V3',async()=>{
 expect(await acquire('2026-10-03T12:05:00Z','Readable opening paragraphs. '.repeat(10)+'QWxwaGEvYmV0YTEyMzQ1Njc4OTA='.repeat(80))).toBe('FAILED');
 expect((await intake.read<DownstreamJob>('jobs',jobId))?.value).toMatchObject({failureCode:'EXTRACTION_FAILED',failureDetail:'ENCODED_ARTICLE_TEXT'});
 expect(await store.currentEvidence('feed-1')).toHaveLength(0);
 expect((await prepareV3Window(store,'feed-1',window,window.end)).input.articles).toHaveLength(0);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},30000);
