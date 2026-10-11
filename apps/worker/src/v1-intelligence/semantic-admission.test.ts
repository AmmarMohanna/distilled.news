import {afterEach,beforeEach,expect,it} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,feedTransact} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {durableSemanticOperation,type BudgetLane} from './semantic-operations';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore,revision:string;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store);revision=(await store.currentEvidence('feed-1'))[0].revision.id});
afterEach(async()=>ctx.dispose());
const input=(i:number)=>({feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[revision],kind:'RELATION',policyVersion:'test',model:'m',budgetKey:'semantic:2026-10-10',state:{i}});
async function seed(n:number,cost:number,unknown=false){await feedTransact(store,'feed-1',async tx=>{for(let i=0;i<n;i++){const id='prior-'+i;await tx.write('semantic_intents',id,{id,feedId:'feed-1',input:input(i),token:id,leaseUntil:0,reservedCostUsd:.02,createdAt:testPolicy.now()});await tx.write('semantic_results',id,{id,feedId:'feed-1',input:input(i),status:unknown?'DEFERRED':'SUCCEEDED',failure:unknown?'SEMANTIC_OUTCOME_UNKNOWN':undefined,usage:{calls:1,costUsd:unknown?.02:cost,reported:!unknown},createdAt:testPolicy.now()})}})}
async function run(i:number,lane:BudgetLane='PRIMARY'){return durableSemanticOperation(store,input(i),async()=>({value:{ok:true},usage:{calls:1,costUsd:.0001,reported:true}}),'2026-10-10T12:00:00Z',undefined,{lane})}
it('more than twenty cheap settled calls do not starve PRIMARY or RETRY work within monetary capacity',async()=>{await seed(20,.0001);expect((await run(101)).status).toBe('SUCCEEDED');expect((await run(102,'RETRY')).status).toBe('SUCCEEDED')},15000);
it('unused retry allocations cannot strand ordinary capacity; correction headroom is still guaranteed',async()=>{await seed(4,.018);expect(await run(101,'RETRY')).toMatchObject({failure:'SEMANTIC_BUDGET_EXHAUSTED',usage:{calls:0}});expect(await run(102,'PROTECTED')).toMatchObject({status:'SUCCEEDED'});expect((await store.list<any>('feed-1','semantic_intents')).length).toBe(5)},15000);
it('an unknown reservation blocks rebilling that question but not independent evidence that fits',async()=>{await seed(1,0,true);await seedIntelligence(store,2,'A court cancelled the election.');revision=(await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId==='observation-2')!.revision.id;expect((await run(102)).status).toBe('SUCCEEDED');expect((await store.list<any>('feed-1','semantic_intents')).length).toBe(2)},15000);
it('all held unknown reservations count at full ceiling and prevent runaway spend',async()=>{await seed(5,0,true);await seedIntelligence(store,2,'A court cancelled the election.');revision=(await store.currentEvidence('feed-1')).find(e=>e.revision.sourceObservationId==='observation-2')!.revision.id;expect(await run(102,'PROTECTED')).toMatchObject({status:'DEFERRED',usage:{calls:0}});expect((await store.list<any>('feed-1','semantic_intents')).length).toBe(5)},15000);
it('concurrent reservation denies excess work, then releases actual cost without poisoning that question',async()=>{
 await seed(3,.018);let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),finish=new Promise<void>(r=>release=r);
 const first=durableSemanticOperation(store,input(201),async()=>{entered();await finish;return {value:{ok:true},usage:{calls:1,costUsd:.0001,reported:true}}},'2026-10-10T12:00:00Z',undefined,{lane:'PRIMARY'});
 await started;expect(await run(202)).toMatchObject({status:'DEFERRED',usage:{calls:0}});release();expect((await first).status).toBe('SUCCEEDED');expect((await run(202)).status).toBe('SUCCEEDED');
 expect((await store.list<any>('feed-1','semantic_intents')).length).toBe(5);
},15000);
