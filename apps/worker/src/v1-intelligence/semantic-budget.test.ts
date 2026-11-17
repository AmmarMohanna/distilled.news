import {syntheticModelAdmission} from './test-utils';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy} from '../v1-intake/test-utils';
import {createCandidateIntakePort} from '../v1-intake/intake';
import {acceptAcquiredContent} from '../v1-intake/evidence';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence,acceptEvidence} from './test-utils';
import {prepareSemanticMatch} from './semantic-preparation';
import {testDurableSemanticOperation as durableSemanticOperation} from './test-utils';
import {type BudgetLane} from './semantic-operations';
import type {Env} from '../types';


let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
const usage={calls:1,costUsd:.0001,reported:true};
const intents=async()=>(await store.list<any>('feed-1','semantic_intents')).filter(i=>i.input.budgetKey===`semantic:${testPolicy.now().slice(0,10)}`);

describe('retries read back what already succeeded instead of re-spending the allowance',()=>{
 const jevFetcher=(counter:{n:number}):typeof fetch=>async(_url,options)=>{counter.n++;const req=JSON.parse(String(options?.body)),answers:any={};for(const [key,q] of Object.entries(req.questions) as [string,any][]){if(q.type==='choice'){const chosen=key==='structure'?'EVENT_0':'CORROBORATES';answers[key]={type:'choice',choice:chosen,confidence:.99,probabilities:Object.fromEntries(Object.keys(q.criteria).map(k=>[k,k===chosen?1:0]))}}else if(q.type==='noul')answers[key]={type:'noul',noul:1};else answers[key]={type:'score',score:0,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_:any,i:number)=>[String(i),i===0?1:0]))}}return new Response(JSON.stringify({answers,usage:{input_tokens:20,output_tokens:10,cost:.001}}))};
 async function corroboration(){
  const body='Parliament approved the banking reform. Officials confirmed the legislation passed.';await seedIntelligence(store,1,body);
  const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-2';batch.proposals[0].sourceItemKey='item-2';const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
  await acceptAcquiredContent(intake,{id:'copy',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',body,representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  return JSON.stringify(['REASSESS','observation-2','']);
 }
 it('relation and effect judgments that succeeded under attempt 0 cost no call and no allowance on attempts 1 and 2',async()=>{
  const job=await corroboration(),counter={n:0},strong={model:'fake',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{throw Error('construction not needed')}},env={DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-only'} as Env;
  const first=await prepareSemanticMatch(store,env,job,testPolicy.now(),{strong,fetcher:jevFetcher(counter)});
  expect(first?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(counter.n).toBe(2);expect(await intents()).toHaveLength(2);
  for(const attempt of [1,2]){const again=await prepareSemanticMatch(store,env,job,testPolicy.now(),{strong,fetcher:jevFetcher(counter),attempt});expect(again?.prepared.decision.structuralRelation).toBe('SAME_EVENT');expect(again?.prepared.decision.provenance.judgmentId).toBe(first?.prepared.decision.provenance.judgmentId)}
  expect(counter.n).toBe(2);expect(await intents()).toHaveLength(2);// previously 6 calls and 6 allowance units
 },40000);
 it('strong construction that succeeded is reused by a retry; a REJECTED construction is retried under a new identity',async()=>{
  const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
  await acceptAcquiredContent(intake,{id:'content',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Officials confirmed the banking reform passed.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  const job=JSON.stringify(['REASSESS','observation-1','']);let calls=0;
  const strong={model:'fake-strong',admission:syntheticModelAdmission,usage:()=>usage,complete:async(_f:string,_p:string,state:any)=>{calls++;return {value:{groups:[{claimMentionIds:state.claimMentions.map((m:any)=>m.id),structuralRelation:'NEW_STORYLINE',eventId:null,storylineId:null,epistemicEffects:['CHANGES_STATE'],entities:[],slots:[]}],backgroundMentionIds:[],confidence:.9},usage}}};
  await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});expect(calls).toBe(1);
  await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong,attempt:1});await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong,attempt:2});expect(calls).toBe(1);
  // A new day changes accounting, not the exact witnessed semantic question.
  await prepareSemanticMatch(store,{} as Env,job,'2026-10-05T10:00:00Z',{strong,attempt:3});expect(calls).toBe(1);
 },40000);
 it('known rejected construction is retained and its scoped continuation does not rebill across attempts',async()=>{
  const intake=new V1IntakeStore(ctx.db),accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batchFixture());
  await acceptAcquiredContent(intake,{id:'content',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-1',body:'Officials confirmed the banking reform passed.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  const job=JSON.stringify(['REASSESS','observation-1','']);let calls=0;
  const strong={model:'fake-strong',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{calls++;return {value:{nonsense:true},usage}}};
  const a=await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong});expect(a?.prepared.decision.structuralRelation).toBe('DEFER');expect(calls).toBe(2);
  await prepareSemanticMatch(store,{} as Env,job,testPolicy.now(),{strong,attempt:1});expect(calls).toBe(2);
 },40000);
});

describe('teasers, promotions and calls to action consume no semantic allowance',()=>{
 it('no relation, effect or construction call is made for a revision with no news mention',async()=>{
  await seedIntelligence(store,1,'Parliament approved the banking reform.');
  const intake=new V1IntakeStore(ctx.db),batch=batchFixture(2);batch.observations[0].sourceItemKey='item-2';batch.proposals[0].sourceItemKey='item-2';const accepted=await createCandidateIntakePort(intake,testPolicy).acceptBatch(batch);
  await acceptAcquiredContent(intake,{id:'teaser',feedId:'feed-1',candidateId:accepted.receipts[0].candidateItemId!,sourceObservationId:'observation-2',title:'Here are the top AI agents that can live in your text messages',body:'We created a list of the most notable AI agents that can live in your text messages, from general assistants to agents designed for families, travel, and work.',representation:'ARTICLE_EXCERPT',contentCompleteness:'COMPLETE',acquisitionMethod:'supplied_payload',acquiredAt:testPolicy.now()},testPolicy);
  let fetches=0,strongCalls=0;const strong={model:'fake',admission:syntheticModelAdmission,usage:()=>usage,complete:async()=>{strongCalls++;throw Error('no')}},fetcher:typeof fetch=async()=>{fetches++;throw Error('no')};
  const prepared=await prepareSemanticMatch(store,{DISTILLED_LLM_API_GATEWAY:'openrouter',OPENROUTER_API_KEY:'test-only'} as Env,JSON.stringify(['REASSESS','observation-2','']),testPolicy.now(),{strong,fetcher});
  expect(prepared).toBeUndefined();expect(fetches).toBe(0);expect(strongCalls).toBe(0);expect(await intents()).toHaveLength(0);
 },40000);
});

describe('the shared monetary allowance has no daily call-count cutoff',()=>{
 const ops=async(count:number,lane:BudgetLane|undefined,tag:string)=>{
  const rev=(await store.currentEvidence('feed-1'))[0].revision.id;let ran=0,denied=0;
  for(let i=0;i<count;i++){const r=await durableSemanticOperation(store,{feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[rev],kind:'RELATION',policyVersion:'t',model:'m',budgetKey:'semantic:2026-10-10',state:{tag,i}},async()=>({value:{ok:true},usage}),'2026-10-10T10:00:00Z',undefined,{lane});if(r.failure==='SEMANTIC_BUDGET_EXHAUSTED')denied++;else ran++}
  return {ran,denied};
 };
 beforeEach(async()=>{await seedIntelligence(store,1,'Parliament approved the banking reform.')});

 it('the midnight pattern: cheap backlog, new work and correction processing can all continue after twenty calls',async()=>{
  const backlog=await ops(20,'RETRY','backlog'),fresh=await ops(8,'PRIMARY','fresh'),correction=await ops(8,'PROTECTED','correction');
  expect(backlog).toEqual({ran:20,denied:0});expect(fresh).toEqual({ran:8,denied:0});expect(correction).toEqual({ran:8,denied:0});
  expect(backlog.ran+fresh.ran+correction.ran).toBe(36);// actual settled cost is .0036, safely inside the unchanged ceiling
 },60000);
 it('unlaned semantic work also has no hidden twenty-call cutoff',async()=>{
  expect(await ops(25,undefined,'legacy')).toEqual({ran:25,denied:0});
 },60000);
});
