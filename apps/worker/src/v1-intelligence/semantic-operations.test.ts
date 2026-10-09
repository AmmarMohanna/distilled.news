import {beforeEach,afterEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {durableSemanticOperation} from './semantic-operations';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store)});
afterEach(async()=>ctx.dispose());
it('commits intent before provider use, replays exactly and rejects source revocation during a call',async()=>{
 const evidence=(await store.currentEvidence('feed-1')).map(e=>e.revision.id),input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:evidence,kind:'RELATION',policyVersion:'test',model:'fake',budgetKey:'test',state:{text:'approved'}};
 let calls=0;
 const run=async()=>{calls++;expect(await store.list('feed-1','semantic_intents')).toHaveLength(1);return {value:{relation:'NEW_STORYLINE'},usage:{calls:1,costUsd:.001,reported:true}}};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');expect(first.status).toBe('SUCCEEDED');
 expect(await durableSemanticOperation(store,input,run,'2026-10-03T13:00:00Z')).toEqual(first);expect(calls).toBe(1);
 await expect(durableSemanticOperation(store,{...input,state:{text:'changed'}},async()=>{await new V1IntakeStore(ctx.db).registerScope({... (await new V1IntakeStore(ctx.db).getScope('feed-source-1'))!,enabled:false});return {value:{},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z')).rejects.toMatchObject({code:'SCOPE_DENIED'});
},15000);
it('unknown provider outcomes stay deferred and cannot automatically issue another call',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'RELATION',policyVersion:'test',model:'fake',budgetKey:'unknown',state:{}};let calls=0;
 const run=async()=>{calls++;throw Error('lost connection')};
 const first=await durableSemanticOperation(store,input,run,'2026-10-03T12:00:00Z');expect(first).toMatchObject({status:'DEFERRED',usage:{reported:false,costUsd:.02}});
 expect(await durableSemanticOperation(store,input,run,'2026-10-03T13:00:00Z')).toEqual(first);expect(calls).toBe(1);
},15000);

it('comparative planning reserves a ninety-second lease without increasing the cost reservation',async()=>{
 const input={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:(await store.currentEvidence('feed-1')).map(e=>e.revision.id),kind:'COMPARATIVE_EDITORIAL_PLAN',policyVersion:'test',model:'fake',budgetKey:'planner',state:{}};
 await durableSemanticOperation(store,input,async()=>{const [intent]=await store.list<any>('feed-1','semantic_intents');expect(intent.leaseUntil-Date.now()).toBeGreaterThan(85000);expect(intent.reservedCostUsd).toBe(.02);return {value:{},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-03T12:00:00Z');
},15000);
