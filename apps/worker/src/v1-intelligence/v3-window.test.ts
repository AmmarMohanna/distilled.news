import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {feedFixture,acceptEvidence} from './test-utils';
import {V1FeedStore,feedTransact,FeedTransaction} from './store';
import {dispatchV1Intelligence,processV1Briefing,processV1Reassessment,windowIdentity} from './runtime';
import {publicV1Edition} from './public-read';
import {prepareV3Window} from './v3-window';
import {acquireSemanticWorkLease,releaseSemanticWorkLease,SemanticLeaseError} from './semantic-work-lease';
import type {Env} from '../types';

const window={start:'2026-10-03T12:00:00Z',end:'2026-10-03T12:30:00Z',kind:'30M' as const};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
beforeEach(async()=>{
 ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);
 await store.registerFeed({...feedFixture,createdAt:'2026-10-03T11:00:00Z',briefingFrequency:'30M'});
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',BRIEFING_ENGINE:'v3',OPENROUTER_API_KEY:'test-key'} as Env;
});
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()});
async function article(n=1,publishedAt='2026-10-03T12:05:00Z',acceptedAt='2026-10-03T12:10:00Z',observedAt?:string){
 if(observedAt){
  const intake=new V1IntakeStore(ctx.db),batch=batchFixture(n),policy={...testPolicy,now:()=>acceptedAt},key=`item-${n}`;
  batch.observations[0]={...batch.observations[0],sourceItemKey:key,publisherId:'publisher-1',observedAt};batch.proposals[0]={...batch.proposals[0],sourceItemKey:key};
  const result=await createCandidateIntakePort(intake,policy).acceptBatch(batch);
  await acceptAcquiredContent(intake,{id:`content-${n}`,feedId:'feed-1',candidateId:result.receipts[0].candidateItemId!,sourceObservationId:`observation-${n}`,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',body:'Parliament approved banking reform legislation after a lengthy debate. Presidential approval is still required.',language:'en',publishedAt,acquiredAt:acceptedAt,acquisitionMethod:'supplied_payload'},policy);
 }else await acceptEvidence(store,n,'Parliament approved banking reform legislation after a lengthy debate. The measure still requires presidential approval.','publisher-1',acceptedAt,'en',publishedAt);
 await processV1Reassessment(env,JSON.stringify(['REASSESS',`observation-${n}`,'']),acceptedAt);
}
const fetcher=(seen:string[])=>async(_url:unknown,init?:RequestInit)=>{
 const body=JSON.parse(init!.body as string);seen.push(JSON.stringify(body));
 const verify=body.messages[0].content.includes('meticulous fact-checker');
 const content=verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Banking reform approved',body:'Parliament approved banking reform legislation; presidential approval is still required.',sources:['S1'],relation:'new',importance:1}]};
 return Response.json({id:`gen-test-${seen.length}`,choices:[{message:{content:JSON.stringify(content)},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:0.001}});
};
it('V3 acknowledges acquired evidence without constructing a V2 event graph',async()=>{
 await article();expect(await store.list('feed-1','events')).toHaveLength(0);
 const row=await new V1IntakeStore(ctx.db).read<any>('jobs',JSON.stringify(['REASSESS','observation-1','']));expect(row?.value.state).toBe('DONE');
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);expect(prepared.input.articles).toHaveLength(1);
},30000);
it('uses publication time, admits meaningful late discovery, excludes initial backlog and future evidence',async()=>{
 await article(1);await article(2,'2026-10-03T11:50:00Z');await article(3,'2026-10-02T12:00:00Z');await article(4,'2026-10-03T12:31:00Z');
 const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.input.articles).toHaveLength(2);expect(prepared.input.articles.map(a=>a.publishedAt)).toContain('2026-10-03T11:50:00Z');
},30000);
it('publishes through the shared request, citation and outbox path with paid-call replay on duplicate delivery',async()=>{
 await article();const seen:string[]=[];
 const result=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:34:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(result?.engine).toBe('v3');expect(result?.windowStart).toBe(window.start);expect(result?.windowEnd).toBe(window.end);expect(seen).toHaveLength(2);
 const id=await windowIdentity('feed-1',window);expect(await publicV1Edition(ctx.db,id)).toMatchObject({id,stories:expect.any(Array)});
 expect(await store.read('feed-1','briefing_requests',id)).toMatchObject({state:'DONE',result:'PUBLISHED',engine:'v3'});
 expect(await store.list('feed-1','delivery_jobs')).toHaveLength(1);
 expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=> '2026-10-03T12:35:00Z',undefined,fetcher(seen) as typeof fetch)).toEqual(result);expect(seen).toHaveLength(2);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(2);
},30000);
it('does not call a model for an empty fixed window',async()=>{
 let calls=0;await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,(async()=>{calls++;throw Error('unexpected')}) as typeof fetch);
 expect(calls).toBe(0);expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'DONE',result:'QUIET'});
},30000);
it('does not let a newer direct queue delivery overtake an older runnable request',async()=>{
 await article();const id=await windowIdentity('feed-1',window);await feedTransact(store,'feed-1',tx=>tx.write('briefing_requests',id,{id,feedId:'feed-1',window,state:'PENDING',attempts:0,createdAt:window.end,engine:'v3'}));
 let calls=0;expect(await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window:{start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M'}},()=> '2026-10-03T13:01:00Z',undefined,(async()=>{calls++;throw Error('unexpected')}) as typeof fetch)).toBeUndefined();expect(calls).toBe(0);
},30000);

it('reuses settled editor and verifier calls after a crash before result persistence',async()=>{
 await article();const seen:string[]=[],original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,id,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('simulated crash')}return original.call(this,kind,id,value)});
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,fetcher(seen) as typeof fetch)).rejects.toThrow();expect(seen).toHaveLength(2);
 const edition=await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,fetcher(seen) as typeof fetch);
 expect(edition?.engine).toBe('v3');expect(seen).toHaveLength(2);
},30000);
it('uncertain provider outcomes preserve reservations and never reissue on redelivery',async()=>{
 await article();let calls=0;const offline=(async()=>{calls++;throw Error('connection lost after send')}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await processV1Briefing(env,message,()=>window.end,undefined,offline);
 await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,offline);
 expect(calls).toBe(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'PENDING',reason:'SEMANTIC_OUTCOME_UNKNOWN'});
 const reservations=await ctx.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations r WHERE NOT EXISTS(SELECT 1 FROM v1_model_spending_settlements s WHERE s.id=r.id AND s.reported=1)').first<{n:number}>();expect(reservations?.n).toBe(1);
},30000);
it('source revocation during inference blocks publication while retaining the settled provider receipt',async()=>{
 await article();const seen:string[]=[],transport=fetcher(seen);
 const revoked=(async(url,init)=>{const response=await transport(url,init);if(seen.length===1)await ctx.db.prepare("UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',0),epoch=epoch+1 WHERE id='feed-source-1'").run();return response}) as typeof fetch;
 await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,revoked)).rejects.toThrow();
 expect(seen).toHaveLength(1);expect(await store.list('feed-1','editions')).toHaveLength(0);
 expect(await store.list('feed-1','semantic_settlements')).toMatchObject([{usage:{reported:true,costUsd:.001}}]);
},30000);
it('shared dispatch waits for a full first interval, prepares before close and pins the V3 engine',async()=>{
 await store.registerFeed({...feedFixture,revision:2,createdAt:'2026-10-03T00:35:00Z',briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'UTC'}});
 const sent:unknown[]=[];env={...env,OPENROUTER_API_KEY:undefined,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:00:00Z'));expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:25:00Z'));expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T01:30:00Z'));
 expect(await store.list('feed-1','briefing_requests')).toMatchObject([{engine:'v3',window:{start:'2026-10-03T01:00:00.000Z',end:'2026-10-03T01:30:00.000Z'}}]);expect(sent).toHaveLength(0);
},30000);

it('a normal next interval sees published reader context and only newly eligible articles',async()=>{
 await article();const seen:string[]=[];await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch);
 await article(2,'2026-10-03T12:35:00Z','2026-10-03T12:40:00Z');
 const next={start:window.end,end:'2026-10-03T13:00:00Z',kind:'30M' as const},prepared=await prepareV3Window(store,'feed-1',next,next.end);
 expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0].publishedAt).toBe('2026-10-03T12:35:00Z');expect(prepared.input.prior).toHaveLength(1);
 expect(prepared.input.prior?.[0].body).toContain('presidential approval is still required');
},30000);

it('includes a pre-deadline observation acquired after close and excludes observations arriving afterward',async()=>{
 await article(1,'2026-10-03T12:28:00Z','2026-10-03T12:32:00Z','2026-10-03T12:29:00Z');
 await article(2,'2026-10-03T12:27:00Z','2026-10-03T12:33:00Z','2026-10-03T12:31:00Z');
 const prepared=await prepareV3Window(store,'feed-1',window,'2026-10-03T12:34:00Z');expect(prepared.input.articles).toHaveLength(1);expect(prepared.input.articles[0].publishedAt).toBe('2026-10-03T12:28:00Z');
},30000);

it('keeps V3 briefing attempts intact while another feed operation owns the semantic lease',async()=>{
 await article();const lease=await acquireSemanticWorkLease(store,'feed-1');const seen:string[]=[];
 try{
  for(let i=0;i<6;i++)await expect(processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch)).rejects.toBeInstanceOf(SemanticLeaseError);
  expect(await store.read('feed-1','briefing_requests',await windowIdentity('feed-1',window))).toMatchObject({state:'PENDING',attempts:0,engine:'v3'});
  expect(seen).toHaveLength(0);
 }finally{await releaseSemanticWorkLease(store,lease)}
 expect((await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,fetcher(seen) as typeof fetch))?.engine).toBe('v3');
 expect(seen).toHaveLength(2);
},60000);
