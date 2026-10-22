import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {performance} from 'node:perf_hooks';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {FeedTransaction,V1FeedStore} from './store';
import {eventMemberships} from './engine';
import {feedFixture} from './test-utils';
import type {EventMembership} from '@distilled/contracts';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)},30000);
afterEach(async()=>{vi.restoreAllMocks();await ctx.dispose()},30000);
// Frozen pre-optimization implementation, run against the same real D1 fixture.
// It measures local graph support lookup, without imitating provider latency.
const baselineMemberships=async(tx:FeedTransaction,id:string)=>(await tx.list<EventMembership>('memberships')).filter(m=>m.eventVersionId===id);
for(const fixture of [{name:'small',events:12,history:120},{name:'large',events:100,history:5000},{name:'long-retained-history',events:240,history:12000}]){
 it(`benchmarks exact support retrieval: ${fixture.name}`,async()=>{
  const total=fixture.events+fixture.history;
  const statements:D1PreparedStatement[]=[];
  for(let start=0;start<total;start+=500){
   const members=Array.from({length:Math.min(500,total-start)},(_,offset)=>{const i=start+offset,id=`member-${String(i).padStart(6,'0')}`,eventVersionId=i<fixture.events?`current-${i}`:`retired-${i}`;return {id,eventVersionId,evidenceRevisionId:`revision-${i}`,confidence:.6,algorithmVersion:'fixture',createdAt:testPolicy.now()}});
   statements.push(ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) SELECT 'memberships',json_extract(value,'$.id'),?,value FROM json_each(?)").bind(feedFixture.id,JSON.stringify(members)));
  }
  await ctx.db.batch(statements);
  const measurements={baseline:{durations:[] as number[],listPasses:[] as number[]},optimized:{durations:[] as number[],listPasses:[] as number[]}};
  for(let sample=0;sample<7;sample++){
   for(const mode of (sample%2?['optimized','baseline']:['baseline','optimized']) as ('baseline'|'optimized')[]){
   const tx=new FeedTransaction(store,await store.snapshot(feedFixture.id)),list=vi.spyOn(tx,'list'),started=performance.now();
   const retrieve=mode==='baseline'?baselineMemberships:eventMemberships;
   for(let event=0;event<fixture.events;event++)expect((await retrieve(tx,`current-${event}`)).map(m=>m.evidenceRevisionId)).toEqual([`revision-${event}`]);
   measurements[mode].durations.push(performance.now()-started);measurements[mode].listPasses.push(list.mock.calls.filter(([kind])=>kind==='memberships').length);list.mockRestore();
   expect(tx.metrics.listReads).toBe(1);
   }
  }
  for(const [mode,{durations,listPasses}] of Object.entries(measurements)){
   durations.sort((a,b)=>a-b);
   console.info(JSON.stringify({type:'V1_MEMBERSHIP_BENCHMARK',mode,fixture:fixture.name,currentEvents:fixture.events,retainedMemberships:total,samples:durations.length,p50Ms:durations[3],p95Ms:durations[6],membershipListPasses:listPasses,sqlListReadsPerSample:1,providerCalls:0}));
   expect(Math.max(...listPasses)).toBe(mode==='baseline'?fixture.events:1);
  }
 },90000);
}
