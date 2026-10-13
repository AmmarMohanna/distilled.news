import {syntheticModelAdmission} from './test-utils';
import {admitModelOperation} from './model-capacity';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {processEvidenceIntelligence} from './engine';
import {nextRematch} from './rematch';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it('prepares retained Event context without sequential per-Event document reads',async()=>{
 await seedIntelligence(store,1);
 await acceptEvidence(store,2,'Officials announced a new electricity reform.');
 const reads=vi.spyOn(store,'read');
 const usage={calls:1,costUsd:.001,reported:true};
 const strong={model:'batch-context-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>({value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage})};
 const prepared=await prepareSemanticMatch(store,{} as Env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{strong});
 expect(prepared?.input.candidates).toHaveLength(1);
 expect(reads.mock.calls.filter(([,kind])=>['event_versions','event_semantic_states','storyline_versions','storyline_memories'].includes(kind))).toHaveLength(0);
},20000);
it('prepares strong construction outside CAS and consumes persisted judgment without a second call',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
 await acceptAcquiredContent(intake,{id:'content',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Officials confirmed the banking reform passed.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake-strong',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_feedId:string,_phase:string,state:any)=>{calls++;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
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
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'fake',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{calls++;throw Error('Unexpected strong call')}};
 const fetcher:typeof fetch=async(_url,options)=>{const req=JSON.parse(String(options?.body)),answers:any={};for(const [key,q] of Object.entries(req.questions) as [string,any][]){if(q.type==='choice'){const chosen=key==='structure'?'EVENT_0':'CORROBORATES';answers[key]={type:'choice',choice:chosen,confidence:.99,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===chosen?1:0]))}}else if(q.type==='noul')answers[key]={type:'noul',noul:1};else answers[key]={type:'score',score:0,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_:any,i:number)=>[String(i),i===0?1:0]))}}return new Response(JSON.stringify({answers,usage:{input_tokens:20,output_tokens:10,cost:.001}}))};
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'test-only'} as Env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{strong,fetcher});
 expect(prepared?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(calls).toBe(0);
},25000);

it('multilingual construction beyond a verified model context waits without a call and preserves intake progress',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture()),body=Array.from({length:30},()=>String.fromCharCode(0x062e,0x0628,0x0631).repeat(220)+'.').join(' ');
 await acceptAcquiredContent(intake,{id:'large',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const strong={model:'fake',admission:(state:unknown,schema:object)=>admitModelOperation('fake',state,schema,{contextTokens:1000,maxOutputTokens:100,inputUsdPerToken:0,outputUsdPerToken:0,source:'verified fixture model'}),usage:()=>({calls:0,costUsd:0,reported:true}),complete:async()=>{calls++;throw Error('Input exceeds verified context')}};
 const prepared=await prepareSemanticMatch(store,{} as Env,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),{strong});
 expect(prepared?.prepared.decision.structuralRelation).toBe('DEFER');expect(prepared?.prepared.decision.provenance.fallbackReason).toBe('SEMANTIC_MODEL_CONTEXT_CONTINUATION_REQUIRED');expect(calls).toBe(0);expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);const waits=await store.list<any>('feed-1','semantic_resource_waits');expect(waits).toHaveLength(2);expect(waits.every(w=>w.failure==='SEMANTIC_MODEL_CONTEXT_CONTINUATION_REQUIRED'&&w.usage.calls===0)).toBe(true);expect(await store.list('feed-1','semantic_construction_work')).toHaveLength(1);
 const receipt=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),prepared?.matchers);expect(receipt.semanticDeferred).toBe(true);expect((await intake.read<any>('jobs',JSON.stringify(['REASSESS','observation-1',''])))?.value.state).toBe('DONE');expect(await store.list('feed-1','rematch_requests')).toHaveLength(1);
},25000);

it('retains rejected construction output and repairs once without partitioning or recalling it',async()=>{
 const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
 await acceptAcquiredContent(intake,{id:'rejected-construction',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'OpenAI is launching a new user interface that will bring interactive visuals to ChatGPT.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},response={groups:[{claimMentionIds:['unoffered-mention'],structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},strong={model:'fake-strong',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{calls++;return {value:response,usage}}};
 const job=JSON.stringify(['REASSESS','observation-1','']),first=await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});
 expect(first?.prepared.decision.structuralRelation).toBe('DEFER');
 const savedResults=await store.list<any>('feed-1','semantic_results'),saved=savedResults.find(s=>!s.input.state.repair);expect(savedResults).toHaveLength(2);expect(await store.list('feed-1','semantic_construction_work')).toHaveLength(0);expect(savedResults.find(s=>s.input.state.repair)?.input.state.repair.failureClass).toBe('INVALID_MENTION_REFERENCE');
 expect(saved).toMatchObject({status:'DEFERRED',failure:'SEMANTIC_CONSTRUCTION_REJECTED',usage,validationDiagnostic:{stage:'CONSTRUCTION_BINDING',response,rejection:{code:'SCOPE_DENIED'}}});expect(saved.value).toBeUndefined();
 await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});expect(calls).toBe(2);expect((await store.list<any>('feed-1','semantic_results')).every(r=>r.status==='DEFERRED'&&r.value===undefined)).toBe(true);
},15000);

it('headline development is supplied independently to semantic judgment and title mentions retain their field',async()=>{
 const title='Microsoft and Nvidia unveil a new AI PC.';await acceptEvidence(store,1,'The devices will be shown at an event in August.','publisher-1',testPolicy.now(),'en',testPolicy.now(),title);
 let supplied:any;const usage={calls:1,costUsd:.001,reported:true},strong={model:'title-aware',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_feed:string,_phase:string,state:any)=>{supplied=state;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 const prepared=await prepareSemanticMatch(store,{} as Env,JSON.stringify(['REASSESS','observation-1','']),testPolicy.now(),{strong});expect(supplied.source.title).toBe(title);expect(supplied.claimMentions.some((m:any)=>m.text===title&&m.sourceField==='title')).toBe(true);expect(prepared?.prepared.decision.structuralRelation).toBe('NEW_STORYLINE');
},15000);

it('a provisional Event supported only by this revision cannot resolve itself through cheap corroboration',async()=>{
 await acceptEvidence(store,1,'Officials confirmed the banking reform passed.');const job=JSON.stringify(['REASSESS','observation-1','']);const {deterministicMatchers}=await import('./matchers');
 await processEvidenceIntelligence(store,job,testPolicy.now(),{...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:'test',fallbackReason:'RESOURCE_WAIT'}})}});
 let cheap=0,strongCalls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'independent-construction',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{strongCalls++;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
 const fetcher=(async(_url:any,init:any)=>{cheap++;const q=JSON.parse(init.body).questions;return Response.json({answers:Object.fromEntries(Object.entries(q).map(([key,value]:[string,any])=>[key,value.type==='choice'?{type:'choice',choice:'EVENT_0',confidence:1,probabilities:Object.fromEntries(Object.keys(value.criteria).map(k=>[k,k==='EVENT_0'?1:0]))}:value.type==='noul'?{type:'noul',noul:1}:{type:'score',score:0,confidence:1,probabilities:{'0':1,'1':0,'2':0,'3':0}}])),usage:{input_tokens:10,output_tokens:10,cost:.001}})}) as typeof fetch;
 const prepared=await prepareSemanticMatch(store,{OPENROUTER_API_KEY:'stand-in-only'} as Env,job,testPolicy.now(),{strong,fetcher});expect(cheap).toBe(0);expect(strongCalls).toBe(1);expect(prepared?.prepared.decision.provenance.scorer).toBe('GPT');
},25000);

it('repairs missing mentions with the entire article and accepts only complete source-bound construction',async()=>{
 await acceptEvidence(store,1,'Parliament approved banking reform. Officials disputed the implementation date.');
 let calls=0;const usage={calls:1,costUsd:.001,reported:true},strong={model:'repair-complete',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,phase:string,state:any)=>{
  calls++;expect(state.source.text).toContain('Officials disputed');
  if(calls===2){expect(phase).toBe('SEMANTIC_CONSTRUCTION_REPAIR');expect(state.repair.rejectedResponse.groups[0].claimMentionIds).toHaveLength(1);expect(state.repair.failureClass).toBe('INCOMPLETE_MENTION_COVERAGE')}
  return {value:{groups:[{claimMentionIds:state.claimMentions.slice(0,calls===1?1:undefined).map((m:any)=>m.id),eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage};
 }};
 const job=JSON.stringify(['REASSESS','observation-1','']);const result=await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});
 expect(result?.prepared.decision.provenance.scorer).toBe('GPT');expect(calls).toBe(2);expect(await store.list('feed-1','semantic_construction_work')).toHaveLength(0);
 await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong,attempt:1});expect(calls).toBe(2);const later=await prepareSemanticMatch(store,{} as Env,job,'2026-07-02T00:00:00.000Z',{strong,attempt:2});expect(calls).toBe(2);expect(later?.prepared.decision.provenance.scorer).toBe('GPT');
},25000);
it('an unknown construction outcome cannot start repair or packet calls',async()=>{
 await acceptEvidence(store,1,'Officials approved banking reform.');let calls=0;const usage={calls:1,costUsd:.001,reported:false},strong={model:'unknown-construction',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{calls++;throw Error('SEMANTIC_PROVIDER_FAILURE')}};
 const job=JSON.stringify(['REASSESS','observation-1','']);const first=await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});expect(first?.prepared.decision.structuralRelation).toBe('DEFER');
 await prepareSemanticMatch(store,{} as Env,job,'2026-07-02T00:00:00.000Z',{strong,attempt:1});expect(calls).toBe(1);expect(await store.list('feed-1','semantic_construction_work')).toHaveLength(0);
},25000);

it('ordinary construction receives the complete article with scoped wire references and returns original mention identities',async()=>{
 await acceptEvidence(store,1,'Officials confirmed the banking reform passed.');
 const usage={calls:1,costUsd:.001,reported:true};let calls=0;
 const strong={model:'complete-article-alias-fixture',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{
  calls++;expect(state.referenceEncoding).toContain('Text and meaning are unchanged');expect(state.source.text).toContain('banking reform');expect(state.claimMentions[0].id).toBe('C0');
  return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:[],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.99},usage};
 }};
 const id=JSON.stringify(['REASSESS','observation-1','']);const first=await prepareSemanticMatch(store,{} as Env,id,testPolicy.now(),{strong});expect(first?.prepared.decision.structuralRelation).toBe('NEW_STORYLINE');
 const saved=(await store.list<any>('feed-1','semantic_results')).find(r=>r.input.kind==='SEMANTIC_CONSTRUCTION');expect(saved.input.state.claimMentions[0].id).not.toBe('C0');expect(saved.value.construction.groups[0].claimMentionIds).toEqual(saved.input.state.claimMentions.map((m:any)=>m.id));
 await prepareSemanticMatch(new V1FeedStore(ctx.db),{} as Env,id,testPolicy.now(),{strong});expect(calls).toBe(1);
},20000);
