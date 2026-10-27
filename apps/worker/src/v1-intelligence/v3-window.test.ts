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

async function relativeFeed(originAt='2026-10-03T12:05:40.123Z'){
 await store.registerFeed({...feedFixture,revision:2,createdAt:originAt,briefingFrequency:'30M',briefingSchedule:{durationMinutes:30,timezone:'UTC',originAt}});
 const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;
 await intake.registerScope({...scope,feedRevision:2});
}
it('automatically dispatches the precise first relative close and persists it with settled-call crash recovery',async()=>{
 await relativeFeed();await article(1,'2026-10-03T12:06:00Z');
 const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:30:40.123Z'));
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.122Z'));
 expect(sent).toHaveLength(0);expect(await store.list('feed-1','briefing_requests')).toHaveLength(0);
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.123Z'));
 expect(sent).toHaveLength(1);expect(sent[0].window).toMatchObject({start:'2026-10-03T12:05:40.123Z',end:'2026-10-03T12:35:40.123Z',originAt:'2026-10-03T12:05:40.123Z',schedulePolicy:'creation-relative-v1'});
 const seen:string[]=[],original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,id,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('retained-call crash')}return original.call(this,kind,id,value)});
 await expect(processV1Briefing(env,sent[0],()=>sent[0].window.end,undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true})).rejects.toThrow();
 expect(seen).toHaveLength(2);
 const edition=await processV1Briefing(env,sent[0],()=> '2026-10-03T12:36:40.123Z',undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true});
 expect(edition).toMatchObject({engine:'v3',windowStart:sent[0].window.start,windowEnd:sent[0].window.end});expect(seen).toHaveLength(2);
 await processV1Briefing(env,sent[0],()=> '2026-10-03T12:37:40.123Z',undefined,fetcher(seen) as typeof fetch,{scheduledDelivery:true});
 expect(seen).toHaveLength(2);expect(await store.list('feed-1','editions')).toHaveLength(1);
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:05:40.123Z'));
 expect(sent.at(-1).window.start).toBe(sent[0].window.end);expect(sent.at(-1).window.end).toBe('2026-10-03T13:05:40.123Z');
},60000);
it('recovers missed relative closes consecutively without duplicate requests or inference',async()=>{
 await relativeFeed();env={...env,OPENROUTER_API_KEY:undefined};
 for(let i=0;i<4;i++)await dispatchV1Intelligence(env,new Date('2026-10-03T13:36:00Z'));
 const requests=(await store.list<any>('feed-1','briefing_requests')).sort((a,b)=>a.window.end.localeCompare(b.window.end));
 expect(requests.map(r=>r.window.end)).toEqual(['2026-10-03T12:35:40.123Z','2026-10-03T13:05:40.123Z','2026-10-03T13:35:40.123Z']);
 expect(requests[0].window.start).toBe('2026-10-03T12:05:40.123Z');
 for(let i=1;i<requests.length;i++)expect(requests[i].window.start).toBe(requests[i-1].window.end);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
},60000);
it('an interval edit preserves the original pending request and retries its frozen relative window first',async()=>{
 await relativeFeed();const sent:any[]=[];env={...env,PROCESSING_QUEUE:{send:async(body:unknown)=>{sent.push(body)}}} as unknown as Env;
 await dispatchV1Intelligence(env,new Date('2026-10-03T12:35:40.123Z'));
 const oldMessage=sent[0],id=await windowIdentity('feed-1',oldMessage.window);
 await feedTransact(store,'feed-1',async tx=>{const old=await tx.read<any>('briefing_requests',id);await tx.write('briefing_requests',id,{...old,attempts:1,nextAttemptAt:'2026-10-03T13:30:00Z'})});
 const before=await store.read('feed-1','briefing_requests',id);
 await store.registerFeed({...feedFixture,revision:3,createdAt:'2026-10-03T12:05:40.123Z',briefingFrequency:'HOURLY',briefingSchedule:{durationMinutes:60,timezone:'UTC',originAt:oldMessage.window.end}});
 // Simulate expiration of the old transport's dispatch lease, as in a recovered delivery.
 await ctx.db.prepare("UPDATE v1_queue_dispatches SET lease_until=0 WHERE kind='v1_briefing' AND id=?").bind(id).run();
 await dispatchV1Intelligence(env,new Date('2026-10-03T13:35:40.123Z'));
 expect(await store.read('feed-1','briefing_requests',id)).toEqual(before);
 expect(sent.at(-1).window).toEqual(oldMessage.window);
 const next=(await store.list<any>('feed-1','briefing_requests')).find(r=>r.id!==id)!;
 expect(next.window.start).toBe(oldMessage.window.end);expect(next.window.end).toBe('2026-10-03T13:35:40.123Z');
},60000);


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

for (const promptVersion of [undefined,2,3,4] as const) it(`preserves frozen prompt ${promptVersion??'legacy'} and reuses settled calls after interruption`,async()=>{
 await article();const prepared=await prepareV3Window(store,'feed-1',window,window.end);
 expect(prepared.promptVersion).toBe(4);
 const id=await windowIdentity('feed-1',window),full='Earlier notice\nOfficials say approval is still required.';
 const frozen={...prepared,id,input:{...prepared.input,prior:[{id:'previous-reader-item',at:'2026-10-03T11:30:00Z',headline:full,body:full}]}};
 if(promptVersion===undefined)delete frozen.promptVersion;
 else frozen.promptVersion=promptVersion;
 await feedTransact(store,'feed-1',tx=>tx.write('v3_window_inputs',id,frozen));
 const seen:string[]=[],transport=fetcher(seen),original=FeedTransaction.prototype.write;let crash=true;
 vi.spyOn(FeedTransaction.prototype,'write').mockImplementation(async function(this:FeedTransaction,kind,key,value){if(kind==='v3_window_results'&&crash){crash=false;throw Error('result persistence interruption')}return original.call(this,kind,key,value)});
 const checked=(async(url,init)=>{const request=JSON.parse(String(init?.body));if(request.messages?.[0]?.content.startsWith('You are the editor'))expect(request.messages[1].content.split(full)).toHaveLength(promptVersion===undefined?3:2);return transport(url,init);}) as typeof fetch;
 const message={type:'v1_briefing' as const,feedId:'feed-1',window};
 await expect(processV1Briefing(env,message,()=>window.end,undefined,checked)).rejects.toThrow();
 expect(seen).toHaveLength(2);
 expect((await processV1Briefing(env,message,()=> '2026-10-03T12:32:00Z',undefined,checked))?.engine).toBe('v3');
 expect(seen).toHaveLength(2);
 expect((await store.read<{promptVersion?:number}>('feed-1','v3_window_inputs',id))?.promptVersion).toBe(promptVersion);
},30000);

it('persists a verified complete headline without padding its body',async()=>{
 await article();const seen:string[]=[];
 const provider=async(_url:unknown,init?:RequestInit)=>{const request=JSON.parse(String(init?.body));seen.push(request.messages[0].content);const verify=request.messages[0].content.includes('meticulous fact-checker');return Response.json({id:'gen-headline-'+seen.length,choices:[{message:{content:JSON.stringify(verify?{results:[{i:0,verdict:'ok',issues:[]}]}:{items:[{headline:'Parliament approves banking reform; presidential approval still required',body:'',sources:['S1'],relation:'new',importance:1}]})},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:50,cost:.001}});};
 const edition=await processV1Briefing(env,{type:'v1_briefing',feedId:'feed-1',window},()=>window.end,undefined,provider as typeof fetch);
 expect(edition?.stories).toHaveLength(1);expect(seen).toHaveLength(2);const published=await publicV1Edition(ctx.db,edition!.id);expect(published?.stories[0].claims[0].text.trim()).toBe('Parliament approves banking reform; presidential approval still required');
},30000);

it('batches old publication identities without changing the prepared snapshot',async()=>{
 await article();const baseline=await prepareV3Window(store,'feed-1',window,window.end);
 const old={id:'old',windowEnd:window.start,createdAt:window.start,stories:[],evidenceRevisionIds:Array.from({length:181},(_,i)=>'missing-'+i)};
 vi.spyOn(store,'publishedEditionHistory').mockResolvedValue([old as any]);
 const revision=vi.spyOn(store,'revision');const batched=vi.spyOn(store,'revisionEvidenceIds');
 const actual=await prepareV3Window(store,'feed-1',window,window.end);
 expect(actual).toEqual(baseline);expect(revision).not.toHaveBeenCalled();expect(batched).toHaveBeenCalledOnce();expect(batched.mock.calls[0][1]).toHaveLength(181);
},30000);

it('loads observation timing only for current evidence identities',async()=>{
 await article();const queries:string[]=[];const tracked=new V1FeedStore({prepare(sql:string){queries.push(sql);return ctx.db.prepare(sql)}} as D1Database);await prepareV3Window(tracked,'feed-1',window,window.end);
 const timing=queries.filter(sql=>sql.includes('observedAt FROM v1_revisions'));
 expect(timing).toHaveLength(1);expect(timing[0]).toContain('r.id IN (');
},30000);

it('quiet preparation avoids carry and revision-history reads without changing its snapshot',async()=>{
 const baseline=await prepareV3Window(store,'feed-1',window,window.end);
 const identities=vi.spyOn(store,'revisionEvidenceIds');const lists=vi.spyOn(store,'list');
 const actual=await prepareV3Window(store,'feed-1',window,window.end);
 expect(actual).toEqual(baseline);expect(actual.input.articles).toEqual([]);expect(identities).not.toHaveBeenCalled();
 expect(lists.mock.calls.some(c=>c[1]==='v3_window_results')).toBe(false);
},30000);
