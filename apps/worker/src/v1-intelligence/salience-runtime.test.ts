import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {createSemanticSalienceScorer} from './salience-runtime';
import type {Env} from '../types';
import type {EventVersion} from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store)});
afterEach(async()=>ctx.dispose());
it.each(['SOURCE','FEED'] as const)('%s revocation during JEV prevents a subsequent GPT request',async mode=>{
 const version=(await store.list<EventVersion>('feed-1','event_versions'))[0];let calls=0;
 const env={DB:ctx.db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1',OPENROUTER_API_KEY:'synthetic'} as Env;
 const scorer=createSemanticSalienceScorer(env,async()=>{
  calls++;
  if(mode==='SOURCE'){const intake=new V1IntakeStore(ctx.db),scope=(await intake.getScope('feed-source-1'))!;await intake.registerScope({...scope,enabled:false})}
  else await store.registerFeed({...feedFixture,paused:true,revision:2});
  return Response.json({answers:{judgment:{type:'choice',choice:'HIGH',confidence:.3,probabilities:{LOW:.25,MEDIUM:.25,HIGH:.25,CRITICAL:.25}}},usage:{input_tokens:100,output_tokens:10,cost:.001}});
 })!;
 const result=await scorer.score({feedId:'feed-1',feedRevision:1,targetType:'EVENT',targetVersionId:version.id,text:version.state,version:1,independentSupport:1,persistence:0,recency:1});
 expect(calls).toBe(1);expect(result.usage.calls).toBe(1);expect(result.fallback).toBe('SEMANTIC_JUDGMENT_UNAVAILABLE');
 expect((result as any).attempts[1].reason).toBe('SALIENCE_SCOPE_REVOKED');
});
