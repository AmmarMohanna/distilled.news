import {afterEach,beforeEach,expect,it} from 'vitest';
import {sha256} from '@distilled/contracts';
import {canonicalJson} from '../v1-intake/canonical';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {settleSemanticOperation} from './semantic-settlement';
import {durableSemanticOperation} from './semantic-operations';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,revision:string;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store);revision=(await store.currentEvidence('feed-1'))[0].revision.id});
afterEach(async()=>ctx.dispose());
const input=(day='2026-10-10',attempt=0)=>({feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision],kind:'RELATION',policyVersion:'test',model:'m',budgetKey:'semantic:'+day,state:{source:{id:revision,text:'Approved fact.'},events:[{id:'event',versionId:'v1'}],attempt}});
const witness={eventVersions:{event:'v1'},storylineVersions:{story:'s1'},extractorVersion:'test'};
const usage={calls:1,costUsd:.001,reported:true};
it('a witnessed exact question is reused across days and restarts without another paid intent',async()=>{
 let calls=0;const run=async()=>{calls++;return {value:{ok:true},usage}};
 const a=await durableSemanticOperation(store,input(),run,'2026-10-10T10:00:00Z',undefined,{reuseContext:witness} as any);
 const b=await durableSemanticOperation(new V1FeedStore(ctx.db),input('2026-10-11',3),run,'2026-10-11T10:00:00Z',undefined,{reuseContext:witness} as any);
 expect(b.id).toBe(a.id);expect(calls).toBe(1);expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);
},15000);
it('legacy unknown outcomes cannot be rebilled with a new day, attempt or worker',async()=>{
 let calls=0;const run=async()=>{calls++;throw Error('lost response')};
 await durableSemanticOperation(store,input(),run,'2026-10-10T10:00:00Z');
 const b=await durableSemanticOperation(new V1FeedStore(ctx.db),input('2026-10-11',2),run,'2026-10-11T10:00:00Z',undefined,{reuseContext:witness} as any);
 expect(calls).toBe(1);expect(b.failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);
},15000);
it('missing legacy metadata and an expired intent never authorize a fresh paid question',async()=>{
 const old=input(),id=await sha256(canonicalJson(old));await feedTransact(store,'feed-1',tx=>tx.write('semantic_intents',id,{id,feedId:'feed-1',input:old,token:'expired',leaseUntil:0,reservedCostUsd:.02,createdAt:'2026-10-10T10:00:00Z'}));
 let calls=0;const b=await durableSemanticOperation(store,input('2026-10-11',1),async()=>{calls++;return {value:{},usage}},'2026-10-11T10:00:00Z',undefined,{reuseContext:witness} as any);
 expect(calls).toBe(0);expect(b.failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');expect(await store.read('feed-1','semantic_results',id)).toMatchObject({failure:'SEMANTIC_OUTCOME_UNKNOWN'});
},15000);
it('changed Event/Storyline witness cannot reuse a prior successful judgment',async()=>{
 let calls=0;const run=async()=>{calls++;return {value:{},usage}};await durableSemanticOperation(store,input(),run,'2026-10-10T10:00:00Z',undefined,{reuseContext:witness} as any);
 const next=input('2026-10-11');next.state.events[0].versionId='v2';await durableSemanticOperation(store,next,run,'2026-10-11T10:00:00Z',undefined,{reuseContext:{...witness,eventVersions:{event:'v2'},storylineVersions:{story:'s2'}}} as any);expect(calls).toBe(2);
},15000);
it('paid usage is durably settled even when source revocation prevents semantic consumption',async()=>{
 await expect(durableSemanticOperation(store,input(),async()=>{const intake=new V1IntakeStore(ctx.db);await intake.registerScope({... (await intake.getScope('feed-source-1'))!,enabled:false});return {value:{ok:true},usage}},'2026-10-10T10:00:00Z')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.list<any>('feed-1','semantic_settlements' as any)).toEqual([expect.objectContaining({usage,token:expect.any(String)})]);
},15000);
it('paid settlement survives a pause while canonical processing remains prohibited',async()=>{
 await expect(durableSemanticOperation(store,input(),async()=>{await store.registerFeed({...feedFixture,paused:true,revision:2});return {value:{},usage}},'2026-10-10T10:00:00Z')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 expect(await store.list<any>('feed-1','semantic_settlements' as any)).toHaveLength(1);
},15000);
it('a late known response settles cost but never overwrites an immutable UNKNOWN result',async()=>{
 const i=input(),id=await sha256(canonicalJson(i));let calls=0;
 const result=await durableSemanticOperation(store,i,async()=>{calls++;await feedTransact(store,'feed-1',tx=>tx.write('semantic_results',id,{id,feedId:'feed-1',input:i,status:'DEFERRED',failure:'SEMANTIC_OUTCOME_UNKNOWN',usage:{calls:1,costUsd:.02,reported:false},latencyMs:0,createdAt:'2026-10-10T10:00:00Z'}));return {value:{ok:true},usage}},'2026-10-10T10:00:00Z');
 expect(result.failure).toBe('SEMANTIC_OUTCOME_UNKNOWN');expect((await store.list<any>('feed-1','semantic_settlements' as any))[0].usage).toEqual(usage);
 await durableSemanticOperation(new V1FeedStore(ctx.db),input('2026-10-11',2),async()=>{calls++;return {value:{},usage}},'2026-10-11T10:00:00Z');expect(calls).toBe(1);
},15000);

it('a reported settlement surviving restart is consumed without rebilling the exact question',async()=>{
 const i=input(),id=await sha256(canonicalJson(i)),intent={id,feedId:'feed-1',input:i,token:'known',leaseUntil:0,reservedCostUsd:.02,createdAt:'2026-10-10T10:00:00Z'};
 await feedTransact(store,'feed-1',tx=>tx.write('semantic_intents',id,intent));
 await settleSemanticOperation(store,intent,{id,feedId:'feed-1',input:i,status:'SUCCEEDED',value:{ok:true},usage,latencyMs:1,createdAt:intent.createdAt});
 let calls=0;const result=await durableSemanticOperation(new V1FeedStore(ctx.db),i,async()=>{calls++;return {value:{},usage}},'2026-10-10T10:00:00Z');
 expect(result.status).toBe('SUCCEEDED');expect(calls).toBe(0);expect(await store.read('feed-1','semantic_results',id)).toBeDefined();
},15000);

it('a historical zero-call denial can recover without rewriting that immutable result',async()=>{
 const i=input(),id=await sha256(canonicalJson(i)),denial={id,feedId:'feed-1',input:i,status:'DEFERRED',failure:'SEMANTIC_BUDGET_EXHAUSTED',usage:{calls:0,costUsd:0,reported:true},latencyMs:0,createdAt:'2026-10-10T10:00:00Z'};
 await feedTransact(store,'feed-1',tx=>tx.write('semantic_results',id,denial));let calls=0;
 const result=await durableSemanticOperation(store,i,async()=>{calls++;return {value:{},usage}},'2026-10-10T10:00:00Z');
 expect(result.status).toBe('SUCCEEDED');expect(calls).toBe(1);expect(result.id).not.toBe(id);expect(await store.read('feed-1','semantic_results',id)).toEqual(denial);
},15000);
