import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {createCandidateAcquisitionRouter} from '../v1-intake/acquisition-router';
import {runAcquisitionJob} from '../v1-intake/acquisition';
import type {DownstreamJob} from '../v1-intake/types';
import {withIntelligenceTurn} from '../connector-intelligence-turn';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {processV1Briefing,processV1Reassessment} from './runtime';
import {prepareV3Window} from './v3-window';
import {publicV1Edition} from './public-read';
import type {Env} from '../types';

const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
const acquiredAt='2026-10-03T12:25:00Z',jobId=JSON.stringify(['ACQUIRE','observation-1','']);
const text='Parliament approved banking reform legislation after a lengthy debate. '.repeat(130)+'Presidential approval is still required; the measure has not taken effect.';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,intake:V1IntakeStore,env:Env;
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});intake=new V1IntakeStore(ctx.db);store=new V1FeedStore(ctx.db);
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','integration@example.invalid','integration@example.invalid','integration-owner','user','hash','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','integration','Integration','banking reform',1,'2026-10-03','2026-10-03');");
 await seedIntakeScope(intake);await store.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
 const batch=batchFixture();batch.observations[0].publishedAtHint='2026-10-03T12:20:00Z';batch.proposals[0].publishedAtHint='2026-10-03T12:20:00Z';
 batch.coverage.createdAt=batch.observations[0].observedAt=batch.proposals[0].discoveredAt='2026-10-03T12:24:00Z';
 await createCandidateIntakePort(intake,{...testPolicy,now:()=>acquiredAt}).acceptBatch(batch);
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_REVIEW_PREPARATION_ISOLATED:'true',V1_PUBLICATION_PREPARATION_ISOLATED:'true',BRIEFING_ENGINE:'v3',BRIEFING_EDITOR_MODEL:'openai/gpt-4.1',BRIEFING_VERIFIER_MODEL:'openai/gpt-4.1-mini',OPENROUTER_API_KEY:'test-only-key'} as Env;
});
afterEach(async()=>ctx.dispose());
async function acquire(publishedAt:string,body=text){
 const router=createCandidateAcquisitionRouter({now:()=>acquiredAt,preferFullArticle:true,fetcher:async()=>new Response(`<meta property="article:published_time" content="${publishedAt}"><meta property="article:modified_time" content="2026-10-03T12:20:00Z"><h1>Banking reform</h1><article>${body}</article>`)});
 return runAcquisitionJob(intake,jobId,{...testPolicy,now:()=>acquiredAt},router);
}
it('publishes full acquired evidence through isolated V3 commits with source-owned citations and account receipts',async()=>{
 expect(await acquire('2026-10-03T12:05:00Z')).toBe('DONE');
 await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-1','']),acquiredAt);
 expect(await store.list('feed-1','events')).toHaveLength(0);expect(await store.list('feed-1','claim_mentions')).toHaveLength(0);
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.input.articles[0].text).toBe(text);expect(text.length).toBeGreaterThan(6000);
 const calls:{model:string;prompt:string}[]=[];
 const fetcher=(async(_url,init)=>{
  const request=JSON.parse(init!.body as string),prompt=JSON.stringify(request.messages);calls.push({model:request.model,prompt});
  const verify=request.messages[0].content.includes('meticulous fact-checker');
  const content=verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Parliament approved banking reform legislation; presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};
  return Response.json({id:`gen-integration-${calls.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});
 }) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 const edition=await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=> '2026-10-03T12:34:00Z',undefined,fetcher));
 expect(edition).toMatchObject({engine:'v3',windowStart:window.start,windowEnd:window.end});
 expect(calls.map(c=>c.model)).toEqual(['openai/gpt-4.1','openai/gpt-4.1-mini']);
 expect(calls.every(c=>c.prompt.includes('the measure has not taken effect'))).toBe(true);
 expect(edition!.evidenceRevisionIds).toEqual([prepared.input.articles[0].id]);
 expect(edition!.stories[0].claims[0].support).toMatchObject([{evidenceRevisionId:prepared.input.articles[0].id,quote:text}]);
 expect(await publicV1Edition(ctx.db,edition!.id)).toMatchObject({id:edition!.id,citations:[{evidenceRevisionId:prepared.input.articles[0].id,url:prepared.input.articles[0].url,publishedAt:prepared.input.articles[0].publishedAt}]});
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(2);expect(await store.list('feed-1','events')).toHaveLength(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v3_model_spend').first<{n:number}>())?.n).toBe(0);
 expect((await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first<{n:number}>())?.n).toBe(2);
 expect(await withIntelligenceTurn(env,message,()=>processV1Briefing(env,message,()=> '2026-10-03T12:35:00Z',undefined,fetcher))).toEqual(edition);
 expect(calls).toHaveLength(2);
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
