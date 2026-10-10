import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture} from './v1-intake/test-utils';
import {V1IntakeStore} from './v1-intake/store';
import {acceptV1Handoff,dispatchV1Acquisitions,processV1Acquisition,createV1RuntimePolicy} from './v1-downstream-runtime';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import type {Env,DistilledQueueMessage} from './types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore,env:Env,sent:DistilledQueueMessage[];
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store);sent=[];env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',WEB_OPERATOR_RUNTIME_TOKEN:'test-runtime',PROCESSING_QUEUE:{send:async(body:DistilledQueueMessage)=>{sent.push(body)}}} as unknown as Env});
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
