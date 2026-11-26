import {beforeEach,afterEach,it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,batchFixture,testPolicy,scopeFixture} from './test-utils';
import {V1IntakeStore,itemId} from './store';
import {createCandidateIntakePort} from './intake';
import {V1FeedStore,FeedTransaction} from '../v1-intelligence/store';
import {feedFixture} from '../v1-intelligence/test-utils';
import {canonicalRequest} from './canonical';
import {compactIntakeHandoffs} from '../intake-storage-maintenance';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});afterEach(async()=>ctx.dispose());
const empty=(n=1)=>({...batchFixture(n),observations:[],proposals:[]});
it('evidence-free coverage remains durable without invalidating a canonical Feed snapshot',async()=>{
 const feeds=new V1FeedStore(ctx.db);await feeds.registerFeed(feedFixture);const tx=new FeedTransaction(feeds,await feeds.snapshot('feed-1')),before=await store.snapshot('feed-source-1');
 const result=await createCandidateIntakePort(store,testPolicy).acceptBatch(empty());expect(result).toMatchObject({durable:true,receipts:[]});expect(await store.list('handoffs','feed-source-1')).toHaveLength(1);expect((await store.snapshot('feed-source-1')).epoch).toBe(before.epoch);expect(await feeds.commit(tx)).toBe(true);expect(await store.list('jobs','feed-source-1')).toHaveLength(0);
},15000);
it('a genuine observation still invalidates a concurrently computed Feed snapshot',async()=>{
 const feeds=new V1FeedStore(ctx.db);await feeds.registerFeed(feedFixture);const tx=new FeedTransaction(feeds,await feeds.snapshot('feed-1'));await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture());expect(await feeds.commit(tx)).toBe(false);expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
},15000);
it('concurrent empty journals preserve immutable identity conflicts and exact replay',async()=>{
 const before=await store.snapshot('feed-source-1'),id=itemId('feed-source-1','same-empty-journal'),write=(canonical:string)=>[{table:'handoffs' as const,id,value:{canonical},immutable:true}];
 expect(await store.commit(before,write('first'))).toBe(true);expect(await store.commit(before,write('different'))).toBe(false);expect(await store.read('handoffs',id)).toMatchObject({value:{canonical:'first'}});expect(await store.commit(await store.snapshot('feed-source-1'),write('first'))).toBe(true);
},15000);
it('revoked source authorization still atomically rejects an empty coverage journal',async()=>{
 const before=await store.snapshot('feed-source-1');await store.registerScope({...scopeFixture,enabled:false});expect(await store.commit(before,[{table:'handoffs',id:'revoked-journal',value:{canonical:'empty'},immutable:true}])).toBe(false);expect(await store.read('handoffs','revoked-journal')).toBeUndefined();
},15000);
it('reclaims a legacy handoff payload and preserves exact replay and conflicts',async()=>{
 await ctx.db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const request=empty(),id=itemId('feed-source-1',request.handoffId),port=createCandidateIntakePort(store,testPolicy);
 await store.commit(await store.snapshot('feed-source-1'),[{table:'handoffs',id,value:{canonical:canonicalRequest(request)},immutable:true}]);
 const original=await port.acceptBatch(request);
 expect((await compactIntakeHandoffs(ctx.db)).bytesRemoved).toBeGreaterThan(0);
 expect((await store.read('handoffs',id))?.value).toEqual({sha256:expect.stringMatching(/^[a-f0-9]{64}$/)});
 expect(await port.acceptBatch(request)).toEqual(original);
 await expect(port.acceptBatch({...request,coverage:{...request.coverage,id:'different'}})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
 expect(await compactIntakeHandoffs(ctx.db)).toEqual({scanned:0,bytesRemoved:0});
},15_000);
