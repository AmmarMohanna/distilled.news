import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,acceptEvidence,syntheticModelAdmission} from './test-utils';
import {durableSemanticOperation} from './semantic-operations';
it.each(['workers_ai:@cf/qwen/qwen3-30b-a3b-fp8','cloudflare:openai/gpt-4.1'])('never retries an uncertain semantic question on another route %s',async(model)=>{
 const ctx=await createIntakeDatabase();try{
 await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store);
 const revision=(await store.currentEvidence('feed-1'))[0].revision;let calls=0;
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'provider-identity-test',model:'openai/gpt-4.1',budgetKey:'semantic:2026-10-03',state:{claimMentions:[{id:'m1',text:revision.body}]}};
 const unknown=async()=>{calls++;throw Error('SEMANTIC_OUTCOME_UNKNOWN')},usage=()=>({calls:1,costUsd:.01,reported:false}),options={reuseContext:{version:'unchanged'},operationAdmission:syntheticModelAdmission()};
 const first=await durableSemanticOperation(store,base,unknown,testPolicy.now(),usage,options);
 const second=await durableSemanticOperation(store,{...base,model},unknown,testPolicy.now(),usage,options);
 expect(first.status).toBe('DEFERRED');expect(second.status).toBe('DEFERRED');expect(second.id).toBe(first.id);expect(calls).toBe(1);
 expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);
 }finally{await ctx.dispose()}
},30000);

it('fences a route switch while the first operation is still in flight',async()=>{
 const ctx=await createIntakeDatabase();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});
 try{
 await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await acceptEvidence(store);
 const revision=(await store.currentEvidence('feed-1'))[0].revision;let calls=0,entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve});
 const base={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision.id],kind:'SEMANTIC_CONSTRUCTION',policyVersion:'active-provider-identity-test',model:'openai/gpt-4.1',budgetKey:'semantic:2026-10-03',state:{claimMentions:[{id:'m1',text:revision.body}]}},options={reuseContext:{version:'unchanged'},operationAdmission:syntheticModelAdmission()};
 const first=durableSemanticOperation(store,base,async()=>{calls++;entered();await gate;return {value:{ok:true},usage:{calls:1,costUsd:.01,reported:false}}},testPolicy.now(),()=>({calls:1,costUsd:.01,reported:false}),options);
 await started;
 try{await expect(durableSemanticOperation(store,{...base,model:'workers_ai:@cf/qwen/qwen3-30b-a3b-fp8'},async()=>{calls++;return {value:{ok:true},usage:{calls:1,costUsd:.01,reported:true}}},testPolicy.now(),undefined,options)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(calls).toBe(1)}finally{release();await first}
 }finally{release();await ctx.dispose()}
},30000);
