import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
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
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-strong',usage:()=>usage,complete:async(_feedId:string,_phase:string,state:any)=>{calls++;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
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

it('high-confidence multi-sentence corroboration avoids a strong construction call',async()=>{
 const body='Parliament approved the banking reform. Officials confirmed the legislation passed.';await seedIntelligence(store,1,body);
 const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-2';batch.proposals[0].sourceItemKey='item-2';const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
 await acceptAcquiredContent(intake,{id:'copy',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',body,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake',usage:()=>usage,complete:async()=>{calls++;throw Error('Unexpected strong call')}};
 const fetcher:typeof fetch=async(_url,options)=>{const req=JSON.parse(String(options?.body)),answers:any={};for(const [key,q] of Object.entries(req.questions) as [string,any][]){if(q.type==='choice'){const chosen=key==='structure'?'EVENT_0':'CORROBORATES';answers[key]={type:'choice',choice:chosen,confidence:.99,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===chosen?1:0]))}}else if(q.type==='noul')answers[key]={type:'noul',noul:1};else answers[key]={type:'score',score:0,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_:any,i:number)=>[String(i),i===0?1:0]))}}return new Response(JSON.stringify({answers,usage:{input_tokens:20,output_tokens:10,cost:.001}}))};
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test-only'} as Env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{strong,fetcher});
 expect(prepared?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(calls).toBe(0);
},25000);

it('oversized multilingual construction defers without a model call and preserves normal intake progress',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture()),body=Array.from({length:30},()=>String.fromCharCode(0x062e,0x0628,0x0631).repeat(220)+'.').join(' ');
 await acceptAcquiredContent(intake,{id:'large',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const strong={model:'fake',usage:()=>({calls:0,costUsd:0,reported:true}),complete:async()=>{calls++;throw Error('Input must remain bounded')}};
 const prepared=await prepareSemanticMatch(store,{} as Env,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),{strong});
 expect(prepared?.prepared.decision.structuralRelation).toBe('DEFER');expect(prepared?.prepared.decision.provenance.fallbackReason).toBe('CONSTRUCTION_INPUT_LIMIT');expect(calls).toBe(0);
 const receipt=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),prepared?.matchers);expect(receipt.semanticDeferred).toBe(true);expect((await intake.read<any>('jobs',JSON.stringify(['REASSESS','observation-1',''])))?.value.state).toBe('DONE');expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
},25000);
