import { beforeEach, afterEach, expect, it } from 'vitest';
import { handoffConnectorBatch, type IntakeReceipt } from '@distilled/contracts';
import { V1IntakeStore } from './store';
import { createCandidateIntakePort } from './intake';
import { createIntakeDatabase, seedIntakeScope, batchFixture, testPolicy } from './test-utils';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>, store:V1IntakeStore;
beforeEach(async()=>{ctx=await createIntakeDatabase();store=new V1IntakeStore(ctx.db);await seedIntakeScope(store)});
afterEach(async()=>ctx.dispose());
it('accepted UPSERT commits a candidate, exact input binding and one acquisition job',async()=>{
  const result=await handoffConnectorBatch(createCandidateIntakePort(store,testPolicy),batchFixture());
  expect(result.receipts[0]).toMatchObject({decision:'ACCEPTED',checkpointResolution:'RESOLVED'});
  expect(await store.list('candidates','feed-source-1')).toHaveLength(1);
  expect(await store.listPendingJobs('feed-source-1')).toMatchObject([{observationId:'observation-1',kind:'ACQUIRE'}]);
});
it('lost response retry through a fresh store returns the same durable terminal receipt',async()=>{
  const first=await createCandidateIntakePort(store,testPolicy).acceptBatch(batchFixture());
  const again=await createCandidateIntakePort(new V1IntakeStore(ctx.db),testPolicy).acceptBatch(batchFixture());
  expect(again).toEqual(first); expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
});
it('immutable handoff and observation identities reject changed input without new effects',async()=>{
  const port=createCandidateIntakePort(store,testPolicy);await port.acceptBatch(batchFixture());
  const changed=batchFixture(); changed.coverage.safeCheckpointCursor='different';
  await expect(port.acceptBatch(changed)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const other=batchFixture();other.handoffId='other';other.observations[0].contentHash='b'.repeat(64);
  await expect(port.acceptBatch(other)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(await store.list('jobs','feed-source-1')).toHaveLength(1);
});
it('property order and reordered batch rows do not change immutable request identity',async()=>{
  const port=createCandidateIntakePort(store,testPolicy), first=batchFixture();
  const result=await port.acceptBatch(first);
  const reversed=JSON.parse(JSON.stringify(first,(key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value));
  expect(await port.acceptBatch(reversed)).toEqual(result);
});
it('concurrent same handoff and different observations preserve one candidate and observation-bound jobs',async()=>{
  const port=createCandidateIntakePort(store,testPolicy);
  const same=await Promise.all([port.acceptBatch(batchFixture()),port.acceptBatch(batchFixture())]);
  expect(same[0]).toEqual(same[1]);
  await Promise.all([port.acceptBatch(batchFixture(2)),port.acceptBatch(batchFixture(3))]);
  expect(await store.list('candidates','feed-source-1')).toHaveLength(1);
  expect(await store.list('jobs','feed-source-1')).toHaveLength(3);
  expect(await store.list<IntakeReceipt>('intake_receipts','feed-source-1')).toHaveLength(3);
});
