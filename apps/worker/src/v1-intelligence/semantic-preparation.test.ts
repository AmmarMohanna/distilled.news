import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {processEvidenceIntelligence} from './engine';
import {nextRematch} from './rematch';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it('prepares strong construction outside CAS and consumes persisted judgment without a second call',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
 await acceptAcquiredContent(intake,{id:'content',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Officials confirmed the banking reform passed.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-strong',usage:()=>usage,complete:async()=>{calls++;return {value:{structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],confidence:.9},usage}}};
 const job=JSON.stringify(['REASSESS','observation-1','']);
 const prepared=await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});expect(prepared?.prepared.decision.provenance.scorer).toBe('GPT');
 await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});
 await processEvidenceIntelligence(store,job,testPolicy.now(),prepared?.matchers);
 expect(calls).toBe(1);expect(await store.list('feed-1','events')).toHaveLength(1);
},15000);
it('bounded rematches exhaust independently of publication work',()=>{
 const request={id:'r',feedId:'f',jobId:'j',evidenceRevisionId:'e',createdAt:testPolicy.now(),policyVersion:'v'};
 expect(nextRematch(request,[],testPolicy.now())).toBe(1);
 expect(nextRematch(request,[{id:'a',feedId:'f',requestId:'r',attempt:3,state:'DEFERRED',createdAt:testPolicy.now()}],testPolicy.now())).toBeUndefined();
});
