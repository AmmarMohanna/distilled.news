import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {acceptV1Handoff,dispatchV1Acquisitions,processV1Acquisition,createV1RuntimePolicy} from './v1-downstream-runtime';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import type {Env,DistilledQueueMessage} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore,env:Env,sent:DistilledQueueMessage[];
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true});store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);sent=[];env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',WEB_OPERATOR_RUNTIME_TOKEN:'test-runtime',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env});
afterEach(async()=>ctx.dispose());
it('runtime-authenticated handoff persists before queue send; disabled and unapproved scopes fail closed',async()=>{
 const app=createApp({repository:new InMemoryRepository()});
 const request={method:'POST',body:JSON.stringify(batchFixture()),headers:{'content-type':'application/json'}};
 expect((await app.request('/v1/downstream/handoff',request,env)).status).toBe(401);
 expect(await store.list('jobs','feed-source-1')).toHaveLength(0);
 const first=await app.request('/v1/downstream/handoff',{...request,headers:{...request.headers,authorization:'Bearer test-runtime'}},env);
 expect(first.status).toBe(200);expect(sent).toHaveLength(1);
 expect((await first.json() as {durable:boolean}).durable).toBe(true);
 await expect(acceptV1Handoff({...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:''},batchFixture())).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect((await app.request('/v1/downstream/handoff',request,{...env,V1_DOWNSTREAM_ENABLED:'false'})).status).toBe(404);
});
it('lost send is recovered by bounded existing queue relay and real HTTP extraction; duplicate delivery has no effects',async()=>{
 await acceptV1Handoff(env,batchFixture());
 expect(await dispatchV1Acquisitions(env)).toBe(1);
 let calls=0;const fetcher=async()=>{calls++;return new Response('<meta property="article:published_time" content="2026-10-03T10:00:00Z"><article>New source development</article>')};
 const id=JSON.stringify(['ACQUIRE','observation-1','']);
 expect(await processV1Acquisition(env,id,fetcher)).toBe('DONE');
 expect(await processV1Acquisition(env,id,fetcher)).toBe('SKIPPED');
 expect(calls).toBe(1);expect(await dispatchV1Acquisitions(env)).toBe(0);
 expect(await new V1IntakeStore(ctx.db).list('revisions','feed-source-1')).toHaveLength(1);
});
it('larger source lists admit approved intake and dispatch while retaining approval checks',async()=>{
 const expanded={...env,V1_DOWNSTREAM_FEED_SOURCE_IDS:['feed-source-1',...Array.from({length:10},(_,i)=>`source-${i}`)].join(',')};
 await acceptV1Handoff(expanded,batchFixture());
 expect(await dispatchV1Acquisitions(expanded)).toBe(1);expect(sent).toHaveLength(1);
 await expect(acceptV1Handoff({...expanded,V1_DOWNSTREAM_FEED_SOURCE_IDS:'unapproved'},batchFixture())).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('registered comparable revision schemes order correctly; unknown schemes remain unresolved',async()=>{
 const policy=createV1RuntimePolicy(),ordering=await policy.orderingFor(batchFixture().observations[0]);
 const revision={scheme:'provider_integer',authority:'PROVIDER' as const,comparability:'COMPARABLE' as const,value:'10'};
 expect(ordering.compareRevisions({...revision,value:'11'},revision)).toBe(1);
 expect(ordering.compareRevisions({...revision,value:'9'},revision)).toBe(-1);
 expect(ordering.compareRevisions(revision,revision)).toBe(0);
 expect(ordering.compareRevisions({...revision,scheme:'opaque-vendor'},revision)).toBeNull();
 const telegram={...revision,scheme:'telegram_edit_timestamp',value:'2026-10-05T10:00:00Z'};
 expect(ordering.compareRevisions({...telegram,value:'2026-10-05T10:01:00Z'},telegram)).toBe(1);
 expect(ordering.compareRevisions({...telegram,value:'invalid'},telegram)).toBeNull();
});

it('overlapping and repeated relay ticks do not enqueue the same unowned job twice',async()=>{
 await acceptV1Handoff(env,batchFixture());
 const now=new Date('2026-10-03T12:00:00Z');
 const outcomes=await Promise.all([dispatchV1Acquisitions(env,now),dispatchV1Acquisitions(env,now)]);
 expect(outcomes.reduce((a,b)=>a+b,0)).toBe(1);expect(sent).toHaveLength(1);
 expect(await dispatchV1Acquisitions(env,now)).toBe(0);
});

it('a failed send backs off and expired undelivered reservations recover without changing canonical epochs',async()=>{
 await acceptV1Handoff(env,batchFixture());const now=new Date('2026-10-03T12:00:00Z'),scope=await store.snapshot('feed-source-1');
 env.PROCESSING_QUEUE.send=async()=>{throw Error('queue unavailable')};
 await expect(dispatchV1Acquisitions(env,now)).rejects.toThrow('queue unavailable');
 env.PROCESSING_QUEUE.send=async body=>{sent.push(body as DistilledQueueMessage);return {} as QueueSendResponse};
 expect(await dispatchV1Acquisitions(env,now)).toBe(0);
 expect(await dispatchV1Acquisitions(env,new Date(now.getTime()+30_000))).toBe(1);
 expect(await dispatchV1Acquisitions(env,new Date(now.getTime()+149_999))).toBe(0);
 expect(await dispatchV1Acquisitions(env,new Date(now.getTime()+150_000))).toBe(1);
 expect((await store.snapshot('feed-source-1')).epoch).toBe(scope.epoch);
});

it('dispatch reservations do not let the first five waiting jobs hide the rest of a backlog',async()=>{
 for(let i=0;i<12;i++){const batch=batchFixture(i+1);await acceptV1Handoff(env,batch);}
 const now=new Date('2026-10-03T12:00:00Z');
 expect(await dispatchV1Acquisitions(env,now)).toBe(5);
 expect(await dispatchV1Acquisitions(env,now)).toBe(5);
 expect(await dispatchV1Acquisitions(env,now)).toBe(2);
 expect(new Set(sent.map(m=>(m as {jobId:string}).jobId)).size).toBe(12);
});

it('persists free-only acquisition authority through a collector handoff and skips configured remote execution',async()=>{
 env={...env,SOURCE_FULL_ARTICLES_ENABLED:'true',SOURCE_NATIVE_EXECUTION_ENABLED:'false',SOURCE_EXECUTION_URL:'https://helper.example',SOURCE_EXECUTION_TOKEN:'fixture',SOURCE_EXECUTION_SERVICE:{fetch:async()=>{throw Error('unpaid job invoked helper')},connect:()=>{throw Error('unpaid job invoked helper')}},ZYTE_API_KEY:'fixture'};
 await acceptV1Handoff(env,batchFixture(),undefined,true);
 const id=JSON.stringify(['ACQUIRE','observation-1','']);
 expect((await store.read<import('./v1-intake/types').DownstreamJob>('jobs',id))!.value.unpaidOnly).toBe(true);
 let calls=0;
 const fetcher:typeof fetch=async(value)=>{calls++;expect(String(value)).toContain('publisher.example');return new Response('<html><head><meta property="article:published_time" content="2026-10-03T10:00:00Z"></head><body><article><h1>Public report</h1><p>Parliament approved new banking legislation following a lengthy debate. Officials said the decision followed consultations with consumer protection organizations and local banking representatives. Presidential approval is still required before the measure becomes law.</p></article></body></html>');};
 expect(await processV1Acquisition(env,id,fetcher)).toBe('DONE');expect(calls).toBeGreaterThan(0);
 expect((await store.read<import('./v1-intake/types').DownstreamJob>('jobs',id))!.value.unpaidOnly).toBe(true);
});
it('internal free recovery requires the maintenance secret and matching feed',async()=>{
 const app=createApp({repository:new InMemoryRepository()});
 const body=JSON.stringify({feedId:'wrong-feed',jobId:JSON.stringify(['ACQUIRE','observation-1','']),approvalId:'free-check'});
 const request={method:'POST',headers:{'content-type':'application/json'},body};
 expect((await app.request('/api/internal/collectors/recover-article-unpaid',request,env)).status).toBe(401);
 await acceptV1Handoff(env,batchFixture());
 expect((await app.request('/api/internal/collectors/recover-article-unpaid',{...request,headers:{...request.headers,'x-distilled-internal':'fixture-secret'}},{...env,INTERNAL_MAINTENANCE_SECRET:'fixture-secret'})).status).toBe(404);
 expect((await store.read<import('./v1-intake/types').DownstreamJob>('jobs',JSON.stringify(['ACQUIRE','observation-1',''])))!.value.state).toBe('PENDING');
});
