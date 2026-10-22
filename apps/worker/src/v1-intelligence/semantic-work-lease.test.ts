import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase,seedIntakeScope} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore,FeedTransaction,feedTransact} from './store';
import {acquireSemanticWorkLease,releaseSemanticWorkLease,renewSemanticWorkLease} from './semantic-work-lease';
import {testDurableSemanticOperation as durableSemanticOperation} from './test-utils';
import {feedFixture,seedIntelligence} from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>,store:V1FeedStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();await seedIntakeScope(new V1IntakeStore(ctx.db));store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture)});
afterEach(async()=>ctx.dispose());
it('work-scoped preparation overlaps siblings but excludes duplicate and legacy feed owners',async()=>{
 const first=await acquireSemanticWorkLease(store,'feed-1','review:first');
 const second=await acquireSemanticWorkLease(store,'feed-1','review:second');
 await expect(acquireSemanticWorkLease(store,'feed-1','review:first')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await expect(acquireSemanticWorkLease(store,'feed-1')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await releaseSemanticWorkLease(store,first);await releaseSemanticWorkLease(store,second);
 const legacy=await acquireSemanticWorkLease(store,'feed-1');
 await expect(acquireSemanticWorkLease(store,'feed-1','review:third')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await releaseSemanticWorkLease(store,legacy);
},15000);

it('renewal preserves work identity and replaced work cannot release its successor',async()=>{
 const first=await acquireSemanticWorkLease(store,'feed-1','review:first');
 await renewSemanticWorkLease(store,first);
 expect(await store.read('feed-1','semantic_work_leases',first.id)).toMatchObject({workId:'review:first'});
 await releaseSemanticWorkLease(store,first);
 const next=await acquireSemanticWorkLease(store,'feed-1','review:first');
 await releaseSemanticWorkLease(store,first);
 await expect(acquireSemanticWorkLease(store,'feed-1','review:first')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await releaseSemanticWorkLease(store,next);
},15000);
async function leased(until=Date.now()+90000){const lease={id:'lease',feedId:'feed-1',token:'owner',leaseUntil:until,createdAt:new Date().toISOString()};await feedTransact(store,'feed-1',tx=>tx.write('semantic_work_leases' as any,lease.id,lease));return new (V1FeedStore as any)(ctx.db,lease) as V1FeedStore}
it('an expired processing owner cannot commit canonical writes',async()=>{const held=await leased(Date.now()-1);await expect(feedTransact(held,'feed-1',tx=>tx.write('intelligence_receipts','expired',{id:'expired',feedId:'feed-1'}))).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.read('feed-1','intelligence_receipts','expired')).toBeUndefined()},15000);
it('lease loss between snapshot and commit is fenced atomically',async()=>{const held=await leased(),tx=new FeedTransaction(held,await held.snapshot('feed-1'));await tx.write('intelligence_receipts','stale',{id:'stale',feedId:'feed-1'});await ctx.db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('semantic_work_releases','lease','feed-1',?)").bind(JSON.stringify({id:'lease',feedId:'feed-1',token:'owner'})).run();expect(await held.commit(tx)).toBe(false);expect(await store.read('feed-1','intelligence_receipts','stale')).toBeUndefined()},15000);

it('concurrent processing owners cannot both acquire the Feed; release permits the next owner',async()=>{const first=await acquireSemanticWorkLease(store,'feed-1');await expect(acquireSemanticWorkLease(new V1FeedStore(ctx.db),'feed-1')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});await releaseSemanticWorkLease(store,first);const next=await acquireSemanticWorkLease(store,'feed-1');expect(next.id).not.toBe(first.id)},15000);
it('a provider response after lease loss settles actual cost without committing semantic consumption',async()=>{await seedIntelligence(store);const evidence=(await store.currentEvidence('feed-1'))[0].revision,lease=await acquireSemanticWorkLease(store,'feed-1'),held=new V1FeedStore(ctx.db,lease),usage={calls:1,costUsd:.001,reported:true};await expect(durableSemanticOperation(held,{feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[evidence.id],kind:'RELATION',model:'m',policyVersion:'p',budgetKey:'semantic:2026-10-10',state:{}},async()=>{await releaseSemanticWorkLease(store,lease);return {value:{ok:true},usage}},'2026-10-10T00:00:00Z')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});expect(await store.list('feed-1','semantic_results')).toHaveLength(0);expect(await store.list('feed-1','semantic_settlements')).toEqual([expect.objectContaining({usage})])},15000);

it('renewal keeps a live owner exclusive but cannot resurrect expired or released owners',async()=>{
 const lease=await acquireSemanticWorkLease(store,'feed-1');const original=lease.leaseUntil;
 await renewSemanticWorkLease(store,lease);expect(lease.leaseUntil).toBeGreaterThanOrEqual(original);
 await expect(acquireSemanticWorkLease(store,'feed-1')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 await releaseSemanticWorkLease(store,lease);await expect(renewSemanticWorkLease(store,lease)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 const expired={id:'expired-renewal-owner',feedId:'feed-1',token:'expired',leaseUntil:Date.now()-1,createdAt:new Date().toISOString()};await feedTransact(store,'feed-1',tx=>tx.write('semantic_work_leases',expired.id,expired));
 await expect(renewSemanticWorkLease(store,expired)).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
},15000);

it('execution continuation yields before new payment without exhausting semantic attempts',async()=>{
 await seedIntelligence(store);const evidence=(await store.currentEvidence('feed-1'))[0].revision,lease=await acquireSemanticWorkLease(store,'feed-1');let calls=0;
 const held=new V1FeedStore(ctx.db,{...lease,executionDeadlineMs:Date.now()-1});
 const op={feedId:'feed-1',feedRevision:1,evidenceRevisionIds:[evidence.id],kind:'RELATION',model:'m',policyVersion:'continuation-p',budgetKey:'semantic:2026-10-10',state:{}};
 const result=await durableSemanticOperation(held,op,async()=>{calls++;return {value:{ok:true},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-10T00:00:00Z');
 expect(result.failure).toBe('SEMANTIC_EXECUTION_YIELD');expect(result.usage.calls).toBe(0);expect(calls).toBe(0);expect(await store.list('feed-1','semantic_intents')).toHaveLength(0);
 await releaseSemanticWorkLease(store,lease);const next=await acquireSemanticWorkLease(store,'feed-1');
 const completed=await durableSemanticOperation(new V1FeedStore(ctx.db,next),op,async()=>{calls++;return {value:{ok:true},usage:{calls:1,costUsd:.001,reported:true}}},'2026-10-10T00:00:00Z');expect(completed.status).toBe('SUCCEEDED');expect(calls).toBe(1);
},20000);

it('renewed ownership remains visible to the unchanged lease query after the parent expiry',async()=>{
 const held=await leased(Date.now()+15000),lease=held.semanticLease!;await renewSemanticWorkLease(store,lease);
 vi.useFakeTimers({toFake:['Date']});try{
  vi.setSystemTime(Date.now()+20000);
  const legacy=await ctx.db.prepare("SELECT id FROM v1_feed_documents l WHERE l.kind='semantic_work_leases' AND l.feed_id=? AND json_extract(l.json,'$.leaseUntil')>? AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='semantic_work_releases' AND r.id=l.id AND json_extract(r.json,'$.token')=json_extract(l.json,'$.token')) LIMIT 1").bind('feed-1',Date.now()).first<{id:string}>();
  expect(legacy?.id).toBe(lease.id);await expect(acquireSemanticWorkLease(store,'feed-1')).rejects.toMatchObject({code:'TEMPORARY_UNAVAILABLE'});
 }finally{vi.useRealTimers()}
 await releaseSemanticWorkLease(store,lease);const next=await acquireSemanticWorkLease(store,'feed-1');expect(next.token).not.toBe(lease.token);
},15000);
