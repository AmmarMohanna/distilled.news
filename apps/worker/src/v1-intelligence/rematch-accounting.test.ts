import {it,expect,vi,describe} from 'vitest';
const prepared=vi.hoisted(()=>({value:undefined as any}));
vi.mock('./semantic-preparation',()=>({prepareSemanticMatch:async()=>prepared.value}));
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {scheduleRematch,nextRematch,rematchExhausted,type RematchAttempt,type RematchRequest} from './rematch';
import {processV1Rematch} from './runtime';
import {deterministicMatchers} from './matchers';
import type {Env} from '../types';

const request:RematchRequest={id:'r',feedId:'f',jobId:'j',evidenceRevisionId:'e',createdAt:'2026-10-01T00:00:00Z',policyVersion:'v'};
const day=(n:number)=>`2026-10-0${n}T10:00:00Z`;
const wait=(attempt:number,n:number):RematchAttempt=>({id:`w${n}`,feedId:'f',requestId:'r',attempt,state:'WAITING_BUDGET',reason:'SEMANTIC_BUDGET_EXHAUSTED',createdAt:day(n),nextAttemptAt:`2026-10-0${n+1}T00:00:00.000Z`});
const real=(attempt:number,n:number,reason?:string,state:RematchAttempt['state']='DEFERRED'):RematchAttempt=>({id:`a${attempt}-${n}`,feedId:'f',requestId:'r',attempt,state,reason,createdAt:day(n),nextAttemptAt:`2026-10-0${n}T10:05:00.000Z`});

describe('budget waits are pre-call denials and never consume a real semantic attempt',()=>{
 const waits=[wait(1,1),wait(1,2),wait(1,3),wait(1,4)];
 it('repeated waits alone leave the request fully eligible with the full allowance',()=>{
  expect(rematchExhausted(waits)).toBe(false);
  expect(nextRematch(request,waits,'2026-10-05T01:00:00Z')).toBe(1);
  expect(nextRematch(request,waits,'2026-10-04T12:00:00Z')).toBeUndefined();// still inside the wait window
 });
 it('after many waits the three real attempts are still all available, then exactly three are enforced',()=>{
  const one=[...waits,real(1,5)];expect(rematchExhausted(one)).toBe(false);expect(nextRematch(request,one,'2026-10-06T00:00:00Z')).toBe(2);
  const two=[...one,real(2,6)];expect(rematchExhausted(two)).toBe(false);expect(nextRematch(request,two,'2026-10-07T00:00:00Z')).toBe(3);
  const three=[...two,real(3,7)];expect(rematchExhausted(three)).toBe(true);expect(nextRematch(request,three,'2026-10-09T00:00:00Z')).toBeUndefined();
 });
 it('a wait between real attempts does not reset or inflate the count',()=>{
  const mixed=[real(1,1),wait(2,2),wait(2,3),real(2,4),wait(3,5)];
  expect(rematchExhausted(mixed)).toBe(false);expect(nextRematch(request,mixed,'2026-10-07T00:00:00Z')).toBe(3);
 });
 it('legacy EXHAUSTED records with the budget reason stay immutable and are treated as denials',()=>{
  const legacy:RematchAttempt={...wait(1,1),state:'EXHAUSTED'};
  expect(rematchExhausted([legacy,legacy])).toBe(false);expect(nextRematch(request,[legacy],'2026-10-03T00:00:00Z')).toBe(1);
 });
 it('stale races after waits keep their separate bounded allowance',()=>{
  const h=[...waits,real(1,5,'STALE_PREPARED_MEMORY'),real(2,6,'STALE_PREPARED_MEMORY')];
  expect(rematchExhausted(h)).toBe(false);expect(nextRematch(request,h,'2026-10-07T00:00:00Z')).toBe(3);
  expect(rematchExhausted([...h,real(3,7,'STALE_PREPARED_MEMORY')])).toBe(true);
  // Real attempts remain limited to three even with stale races interleaved.
  const interleaved=[...waits,real(1,5,'STALE_PREPARED_MEMORY'),real(2,6,'SEMANTIC_IDENTITY_UNRESOLVED'),real(3,7,'SEMANTIC_IDENTITY_UNRESOLVED'),real(4,8,'SEMANTIC_IDENTITY_UNRESOLVED')];
  expect(rematchExhausted(interleaved)).toBe(true);
 });
 it('an unknown outcome is a real attempt and stays fenced until its recorded time',()=>{
  const unknown=[...waits,real(1,5,'SEMANTIC_OUTCOME_UNKNOWN')];
  expect(rematchExhausted(unknown)).toBe(false);expect(nextRematch(request,unknown,'2026-10-05T10:01:00Z')).toBeUndefined();expect(nextRematch(request,unknown,'2026-10-05T10:06:00Z')).toBe(2);
 });
});

describe('persisted accounting through processV1Rematch after repeated budget waits',()=>{
 const env=(db:unknown)=>({DB:db,V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'feed-source-1'} as unknown as Env);
 async function setup(){
  const context=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(context.db));const store=new V1FeedStore(context.db);await store.registerFeed(feedFixture);await seedIntelligence(store);
  const revision=(await store.currentEvidence('feed-1'))[0].revision;
  await feedTransact(store,'feed-1',tx=>scheduleRematch(tx,JSON.stringify(['REASSESS','observation-1','']),revision.id,testPolicy.now()));
  const req=(await store.list<RematchRequest>('feed-1','rematch_requests'))[0];
  for(let n=1;n<=4;n++)await feedTransact(store,'feed-1',tx=>tx.write('rematch_attempts',`wait-${n}`,{id:`wait-${n}`,feedId:'feed-1',requestId:req.id,attempt:1,state:'WAITING_BUDGET',reason:'SEMANTIC_BUDGET_EXHAUSTED',createdAt:`2026-10-0${n}T10:00:00.000Z`,nextAttemptAt:`2026-10-0${n+1}T00:00:00.000Z`}));
  return {context,store,req};
 }
 const outcome=async(kind:'success'|'deferred'|'stale')=>{
  const {context,store,req}=await setup();
  try{
   prepared.value=kind==='success'?{prepared:{decision:{structuralRelation:'SAME_EVENT',provenance:{scorer:'GPT',policyVersion:'t'}}},matchers:deterministicMatchers}
    :{prepared:{decision:{structuralRelation:'SAME_EVENT',provenance:{scorer:'GPT',policyVersion:'t'}}},matchers:{...deterministicMatchers,event:{match:()=>({structuralRelation:'DEFER',epistemicEffects:[],confidence:0,provenance:{scorer:'SEMANTIC',policyVersion:'t',fallbackReason:kind==='stale'?'STALE_PREPARED_MEMORY':'SEMANTIC_IDENTITY_UNRESOLVED'}})}}};
   await processV1Rematch(env(context.db),'feed-1',req.id,'2026-10-06T10:00:00.000Z');
   const attempts=await store.list<RematchAttempt>('feed-1','rematch_attempts'),real=attempts.filter(a=>a.state!=='WAITING_BUDGET');
   return {real,next:nextRematch(req,attempts,'2026-10-20T00:00:00Z'),attempts};
  }finally{prepared.value=undefined;await context.dispose()}
 };
 it('the first real attempt after four waits is attempt 1 of 3 and is never marked EXHAUSTED because of the waits',async()=>{
  const deferred=await outcome('deferred');expect(deferred.real).toHaveLength(1);expect(deferred.real[0]).toMatchObject({attempt:1,state:'DEFERRED'});expect(deferred.next).toBe(2);
 },40000);
 it('a stale outcome after waits is DEFERRED with the short stale retry, not exhausted',async()=>{
  const stale=await outcome('stale');expect(stale.real[0]).toMatchObject({attempt:1,state:'DEFERRED',reason:'STALE_PREPARED_MEMORY'});expect(stale.next).toBe(2);
 },40000);
 it('a successful outcome after waits records SUCCEEDED and ends the request',async()=>{
  const ok=await outcome('success');expect(ok.real[0]).toMatchObject({state:'SUCCEEDED'});expect(ok.next).toBeUndefined();
 },40000);
});
