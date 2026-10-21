import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {acceptEvidence,feedFixture,syntheticModelAdmission} from './test-utils';
import {withSemanticWorkLease} from './semantic-work-lease';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {batchFixture} from '../v1-intake/test-utils';
import {processV1Reassessment} from './runtime';
import * as preparation from './semantic-preparation';
import * as engine from './engine';
import {withIntelligenceTurn,withFeedWriteTurn,intelligenceTurnGuard} from '../connector-intelligence-turn';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,env:Env;
const job=JSON.stringify(['REASSESS','observation-1','']);
beforeEach(async()=>{
 ctx=await createIntakeDatabase({product:true});store=new V1FeedStore(ctx.db);
 await ctx.db.exec("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('owner-1','test@example.invalid','test@example.invalid','test-owner','user','hash','2026-10-03','2026-10-03','2026-10-03'); INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES('feed-1','owner-1','feed-1','Test','news',1,'2026-10-03','2026-10-03');");
 await seedIntakeScope(new V1IntakeStore(ctx.db));await store.registerFeed(feedFixture);await acceptEvidence(store);
 env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_REVIEW_PREPARATION_ISOLATED:'true'} as Env;
});
afterEach(async()=>{vi.restoreAllMocks();await ctx?.dispose()});
it('slow preparation allows promotion; canonical consumption reacquires its fenced turn',async()=>{
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r}),wait=new Promise<void>(r=>{release=r});
 vi.spyOn(preparation,'prepareSemanticMatch').mockImplementation(async()=>{expect(intelligenceTurnGuard(ctx.db,'feed-1').sql).toBe('');entered();await wait;return undefined});
 const original=engine.processEvidenceIntelligence;
 const consume=vi.spyOn(engine,'processEvidenceIntelligence').mockImplementation(async(...args)=>{expect(intelligenceTurnGuard(ctx.db,'feed-1').sql).not.toBe('');return original(...args)});
 const running=withIntelligenceTurn(env,{type:'v1_reassess',jobId:job},()=>processV1Reassessment(env,job,testPolicy.now()));
 await started;
 try{await withFeedWriteTurn(env,'feed-1',()=>acceptEvidence(store,2,'Officials confirmed a separate election result.'),'acquisition:second')}
 finally{release()}
 await running;expect(consume).toHaveBeenCalledTimes(1);
 expect((await new V1IntakeStore(ctx.db).read<any>('jobs',job))?.value.state).toBe('DONE');
 expect(await store.currentEvidence('feed-1')).toHaveLength(2);
},30000);

it('busy canonical admission preserves the paid preparation and canonical attempt budget',async()=>{
 vi.spyOn(preparation,'prepareSemanticMatch').mockResolvedValue(undefined);
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r});
 const holding=withFeedWriteTurn(env,'feed-1',async()=>{entered();await new Promise<void>(r=>{release=r})},'another:commit');
 await started;
 try{await expect(processV1Reassessment(env,job,testPolicy.now())).rejects.toThrow('INTELLIGENCE_TURN_BUSY')}
 finally{release();await holding}
 expect((await new V1IntakeStore(ctx.db).read<any>('jobs',job))?.value).toMatchObject({state:'PENDING',attempts:0});
 expect(await store.list('feed-1','intelligence_receipts')).toHaveLength(0);
},30000);

it('replacement of the same evidence during a billed preparation settles cost and rejects stale consumption',async()=>{
 const logs=vi.spyOn(console,'info').mockImplementation(()=>{});
 let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>{entered=r}),wait=new Promise<void>(r=>{release=r});let calls=0;
 const usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'race-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{calls++;entered();await wait;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 const pending=withSemanticWorkLease(ctx.db,'feed-1',held=>preparation.prepareSemanticMatch(held,env,job,testPolicy.now(),{strong}),'review:'+job).then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 await started;
 try{
  await withFeedWriteTurn(env,'feed-1',async()=>{
   const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';
   const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
   await acceptAcquiredContent(intake,{id:'replacement',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',body:'Officials corrected the banking reform result.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  },'replacement');
 }finally{release()}
 const outcome=await pending;expect(outcome.error).toMatchObject({code:'SCOPE_DENIED'});expect(calls).toBe(1);
 expect(await store.list('feed-1','semantic_settlements')).toMatchObject([{usage}]);expect(await store.list('feed-1','semantic_results')).toHaveLength(0);
 expect(await store.list('feed-1','events')).toHaveLength(0);
 expect((await store.currentEvidence('feed-1'))[0].revision.body).toContain('corrected');
 expect((await new V1IntakeStore(ctx.db).read<any>('jobs',JSON.stringify(['REASSESS','observation-2',''])))?.value.state).toBe('PENDING');
 const modelLog=logs.mock.calls.map(([raw])=>{try{return JSON.parse(raw)}catch{return null}}).find(r=>r?.type==='V1_PIPELINE_LATENCY'&&r.phase==='MODEL');
 expect(modelLog).toMatchObject({outcome:'FAILED',receiptOperationId:expect.any(String),counts:{receiptReportedCostUsd:.001,reportedUsage:1}});
},30000);

it('independent new-event preparations overlap while a stale sibling keeps a durable rematch without duplicate payment',async()=>{
 await acceptEvidence(store,2,'Officials announced a separate election result.');
 const secondJob=JSON.stringify(['REASSESS','observation-2','']);
 let firstEntered!:()=>void,releaseFirst!:()=>void,secondPrepared!:()=>void,releaseSecond!:()=>void;
 const firstStarted=new Promise<void>(r=>{firstEntered=r}),firstWait=new Promise<void>(r=>{releaseFirst=r});
 const secondReady=new Promise<void>(r=>{secondPrepared=r}),secondWait=new Promise<void>(r=>{releaseSecond=r});let calls=0;
 const usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'sibling-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{calls++;if(calls===1){firstEntered();await firstWait}return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 const first=withSemanticWorkLease(ctx.db,'feed-1',async held=>{
  const prepared=await preparation.prepareSemanticMatch(held,env,job,testPolicy.now(),{strong});
  return withFeedWriteTurn(env,'feed-1',()=>engine.processEvidenceIntelligence(held,job,testPolicy.now(),prepared?.matchers),'review:first');
 },'review:'+job);
 await firstStarted;
 const second=withSemanticWorkLease(ctx.db,'feed-1',async held=>{
  const prepared=await preparation.prepareSemanticMatch(held,env,secondJob,testPolicy.now(),{strong});secondPrepared();await secondWait;
  return withFeedWriteTurn(env,'feed-1',()=>engine.processEvidenceIntelligence(held,secondJob,testPolicy.now(),prepared?.matchers),'review:second');
 },'review:'+secondJob);
 // Observe errors immediately so a failing probe cannot leave an unhandled rejection.
 const guardedSecond=second.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
 const ready=await Promise.race([secondReady.then(()=>true),guardedSecond.then(()=>false)]);
 releaseFirst();const firstReceipt=await first;releaseSecond();const secondOutcome=await guardedSecond;
 expect(ready).toBe(true);expect(firstReceipt.semanticDeferred).not.toBe(true);expect(secondOutcome.error).toBeUndefined();expect(secondOutcome.value?.semanticDeferred).toBe(true);
 expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);expect(await store.list('feed-1','semantic_settlements')).toHaveLength(2);expect(calls).toBe(2);
 const revisions=new Set((await store.currentEvidence('feed-1')).map(e=>e.revision.id));
 expect(new Set((await store.list<any>('feed-1','memberships')).map(m=>m.evidenceRevisionId))).toEqual(revisions);
},30000);

it('revalidates candidate support replaced after preparation settled but before canonical consumption',async()=>{
 await engine.processEvidenceIntelligence(store,job,testPolicy.now());
 await acceptEvidence(store,2,'Officials confirmed the banking reform implementation.');
 const secondJob=JSON.stringify(['REASSESS','observation-2','']);let calls=0;
 const usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'support-gap-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{calls++;if(state.policy==='independent-occurrence-identity-v1')return {value:{groups:Object.fromEntries(Object.entries(state.groups).map(([key,g]:[string,any])=>[key,{structuralRelation:'SAME_EVENT',eventId:state.events[0].id,storylineId:null,epistemicEffects:['CORROBORATES'],reason:'Same bounded banking reform implementation.',sourceWitness:g.claims[0].text,targetWitness:state.events[0].state}]))},usage};return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'SAME_EVENT',eventId:state.events[0].id,storylineId:null,epistemicEffects:['CORROBORATES'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 const original=preparation.prepareSemanticMatch;
 vi.spyOn(preparation,'prepareSemanticMatch').mockImplementation(async(held,optionsEnv,id,now)=>{
  const prepared=await original(held,optionsEnv,id,now,{strong});
  expect(prepared?.prepared.decision.structuralRelation).toBe('SAME_EVENT');
  // Model settlement is durable. Change a different supporting item while its
  // Event root still has the old version; its replacement review stays pending.
  await withFeedWriteTurn(env,'feed-1',async()=>{
   const intake=new V1IntakeStore(ctx.db),batch=batchFixture(3);batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';
   const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
   await acceptAcquiredContent(intake,{id:'support-replacement',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-3',body:'Officials corrected the banking reform report.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  },'support:replacement');
  return prepared;
 });
 await processV1Reassessment(env,secondJob,testPolicy.now());
 const receipt=await store.read<any>('feed-1','intelligence_receipts',secondJob);
 expect(receipt.semanticDeferred).toBe(true);
 expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
 expect(await store.list('feed-1','semantic_settlements')).toHaveLength(2);expect(calls).toBe(2);
 expect((await new V1IntakeStore(ctx.db).read<any>('jobs',JSON.stringify(['REASSESS','observation-3',''])))?.value.state).toBe('PENDING');
},30000);

it('V2 retains pre-subscription backlog before semantic preparation and canonical construction',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 const prepare=vi.spyOn(preparation,'prepareSemanticMatch').mockResolvedValue(undefined),consume=vi.spyOn(engine,'processEvidenceIntelligence');
 expect(await processV1Reassessment(env,job,testPolicy.now())).toBe('BACKLOG_RETAINED');
 expect(prepare).not.toHaveBeenCalled();expect(consume).not.toHaveBeenCalled();
 expect(await store.currentEvidence('feed-1')).toHaveLength(1);
 expect((await new V1IntakeStore(ctx.db).read<any>('jobs',job))?.value.state).toBe('DONE');
 expect(await store.list<any>('feed-1','review_admissions')).toMatchObject([{disposition:'BACKLOG_RETAINED',reason:'PRE_SUBSCRIPTION_PUBLICATION'}]);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
 expect(await store.list('feed-1','events')).toHaveLength(0);
},30000);

it('V2 prepares current news and late-discovered news published since subscription',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 await acceptEvidence(store,2,'Officials announced new banking reform.','publisher-1','2026-10-03T14:00:00Z','en','2026-10-03T12:15:00Z');
 const prepare=vi.spyOn(preparation,'prepareSemanticMatch').mockResolvedValue(undefined);
 expect(await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-2','']),'2026-10-03T15:00:00Z')).toBe('DONE');
 expect(prepare).toHaveBeenCalledTimes(1);
},30000);

it('V2 blocks a queued backlog rematch before either inference or canonical consumption',async()=>{
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';
 const revision=(await store.currentEvidence('feed-1'))[0].revision;
 const {feedTransact}=await import('./store');
 await feedTransact(store,'feed-1',tx=>tx.write('rematch_requests','backlog-rematch',{id:'backlog-rematch',feedId:'feed-1',jobId:job,evidenceRevisionId:revision.id,createdAt:testPolicy.now(),policyVersion:'semantic-rematch-continuation-v2'}));
 const prepare=vi.spyOn(preparation,'prepareSemanticMatch').mockResolvedValue(undefined),consume=vi.spyOn(engine,'processEvidenceIntelligence');
 const {processV1Rematch}=await import('./runtime');await processV1Rematch(env,'feed-1','backlog-rematch',testPolicy.now());
 expect(prepare).not.toHaveBeenCalled();expect(consume).not.toHaveBeenCalled();
 expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
 expect(await store.list('feed-1','rematch_attempts')).toHaveLength(0);
},30000);

it('V2 still reviews a correction to evidence already represented in the event graph',async()=>{
 await engine.processEvidenceIntelligence(store,job,testPolicy.now());
 const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-1';batch.proposals[0].sourceItemKey='item-1';
 const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'corrected',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',body:'Officials corrected the banking reform result.',publishedAt:'2026-10-03T10:00:00Z',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 env.V1_PUBLICATION_VALIDATION_CONTRACT='EVIDENCE_GROUNDED_V2';const prepare=vi.spyOn(preparation,'prepareSemanticMatch').mockResolvedValue(undefined);
 expect(await processV1Reassessment(env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now())).toBe('DONE');expect(prepare).toHaveBeenCalledTimes(1);
},30000);
