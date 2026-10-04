import {it,expect,vi} from 'vitest';
const prepared=vi.hoisted(()=>({value:undefined as any}));
vi.mock('./semantic-preparation',()=>({prepareSemanticMatch:async()=>prepared.value}));
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scheduleRematch} from './rematch';
import {processV1Rematch} from './runtime';
import {deterministicMatchers} from './matchers';
import type {Env} from '../types';
it('a stale prepared match remains deferred based on the committed outcome',async()=>{
 const context=await createIntakeDatabase();
 try{
  await seedIntakeScope(new V1IntakeStore(context.db));const store=new V1FeedStore(context.db);await store.registerFeed(feedFixture);await seedIntelligence(store);
  const revision=(await store.currentEvidence('feed-1'))[0].revision,job=JSON.stringify(['REASSESS','observation-1','']);
  await feedTransact(store,'feed-1',tx=>scheduleRematch(tx,job,revision.id,testPolicy.now()));
  const request=(await store.list<any>('feed-1','rematch_requests'))[0];
  prepared.value={prepared:{decision:{structuralRelation:'SAME_EVENT',provenance:{scorer:'GPT',policyVersion:'test'}}},matchers:{...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:'test',fallbackReason:'STALE_PREPARED_MEMORY'}})}}};
  await processV1Rematch({DB:context.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as Env,'feed-1',request.id,testPolicy.now());
  expect(await store.list('feed-1','rematch_attempts')).toMatchObject([{state:'DEFERRED'}]);
 }finally{prepared.value=undefined;await context.dispose()}
},25000);
