import {it,expect,vi} from 'vitest';
import {nextRematch,type RematchRequest,type RematchAttempt} from './rematch';
const request:RematchRequest={id:'r',feedId:'f',jobId:'j',evidenceRevisionId:'e',createdAt:'2026-10-08T00:00:00Z',policyVersion:'v'},base={id:'a',feedId:'f',requestId:'r',attempt:3,createdAt:'2026-10-08T09:00:00Z'};
it.each(['WAITING_BUDGET','EXHAUSTED'] as const)('pre-call budget denial remains durable and retries the same attempt after reset (%s)',state=>{
 const attempt:RematchAttempt={...base,state,reason:'SEMANTIC_BUDGET_EXHAUSTED',nextAttemptAt:'2026-10-08T09:20:00Z'};
 expect(nextRematch(request,[attempt],'2026-10-08T23:59:59Z')).toBeUndefined();expect(nextRematch(request,[attempt],'2026-10-09T00:00:00Z')).toBe(1);
 expect(nextRematch(request,[attempt,{...base,id:'success',attempt:1,state:'SUCCEEDED',createdAt:'2026-10-09T00:01:00Z'}],'2026-10-10T00:00:00Z')).toBeUndefined();
});
it('unknown model outcome and genuine semantic exhaustion never enter the budget retry exception',()=>{
 for(const reason of ['SEMANTIC_OUTCOME_UNKNOWN','SEMANTIC_BUDGET_OUTCOME_UNKNOWN','SEMANTIC_IDENTITY_UNRESOLVED'])expect(nextRematch(request,[{...base,state:'EXHAUSTED',reason}],'2026-10-09T00:00:00Z')).toBeUndefined();
});

it('legacy budget-denial indices do not exhaust remaining real attempts',()=>{
 const completed:RematchAttempt={...base,id:'first',attempt:1,state:'DEFERRED',createdAt:'2026-10-08T08:00:00Z',reason:'SEMANTIC_IDENTITY_UNRESOLVED'},denied:RematchAttempt={...base,state:'EXHAUSTED',reason:'SEMANTIC_BUDGET_EXHAUSTED'};
 expect(nextRematch(request,[completed,denied],'2026-10-09T00:00:00Z')).toBe(2);
});

it('the canonical rematch path durably records budget waiting without issuing a provider call',async()=>{
 const {createIntakeDatabase,seedIntakeScope}=await import('../v1-intake/test-utils'),{V1IntakeStore}=await import('../v1-intake/store'),{V1FeedStore,feedTransact}=await import('./store'),{feedFixture,acceptEvidence}=await import('./test-utils'),{scheduleRematch}=await import('./rematch'),{processV1Rematch}=await import('./runtime');
 const ctx=await createIntakeDatabase(),fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('No model call is allowed after exhaustion'));try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store);
  const revision=(await store.currentEvidence('feed-1'))[0].revision,now='2026-10-08T09:00:00Z';
  await feedTransact(store,'feed-1',async tx=>{for(let i=0;i<20;i++){const id='prior-'+i,input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'test',model:'test',budgetKey:'semantic:2026-10-08',state:{i}};await tx.write('semantic_intents',id,{id,feedId:'feed-1',input,token:id,leaseUntil:0,reservedCostUsd:.02,createdAt:now});await tx.write('semantic_results',id,{id,feedId:'feed-1',input,status:'SUCCEEDED',usage:{calls:1,costUsd:.001,reported:true},createdAt:now});}await scheduleRematch(tx,JSON.stringify(['REASSESS','observation-1','']),revision.id,now)});
  const [request]=await store.list<any>('feed-1','rematch_requests');await processV1Rematch({DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',OPENROUTER_API_KEY:'test-only',V1_SEMANTIC_POLICY:'SEMANTIC'} as any,'feed-1',request.id,now);
  const [attempt]=await store.list<RematchAttempt>('feed-1','rematch_attempts');expect(attempt).toMatchObject({state:'WAITING_BUDGET',attempt:1,reason:'SEMANTIC_BUDGET_EXHAUSTED',nextAttemptAt:'2026-10-09T00:00:00.000Z'});expect(fetcher).not.toHaveBeenCalled();expect(nextRematch(request,[attempt],'2026-10-08T23:59:59Z')).toBeUndefined();expect(nextRematch(request,[attempt],'2026-10-09T00:00:00Z')).toBe(1);expect(await store.revision('feed-1',revision.id)).toEqual(revision);
 }finally{fetcher.mockRestore();await ctx.dispose()}
},25000);
