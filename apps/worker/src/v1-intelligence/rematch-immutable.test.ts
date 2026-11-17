import {it,expect} from 'vitest';
import {createIntakeDatabase,seedIntakeScope,testPolicy} from '../v1-intake/test-utils';
import {V1IntakeStore} from '../v1-intake/store';
import {V1FeedStore} from './store';
import {feedFixture,seedIntelligence} from './test-utils';
import {processEvidenceIntelligence} from './engine';
it('a semantic rematch preserves immutable revision-role and duplicate decisions instead of conflicting on computedAt',async()=>{
 const ctx=await createIntakeDatabase();try{
  await seedIntakeScope(new V1IntakeStore(ctx.db));const store=new V1FeedStore(ctx.db);await store.registerFeed(feedFixture);await seedIntelligence(store,1);
  const roles=await store.list('feed-1','roles'),duplicates=await store.list('feed-1','duplicates');
  const result=await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:10:00.000Z',undefined,'repair-attempt-1');expect(result.decision).toBe('PROCESSED');
  expect(await store.list('feed-1','roles')).toEqual(roles);expect(await store.list('feed-1','duplicates')).toEqual(duplicates);
  expect(await processEvidenceIntelligence(store,JSON.stringify(['REASSESS','observation-1','']),'2026-10-03T12:11:00.000Z',undefined,'repair-attempt-1')).toEqual(result);
 }finally{await ctx.dispose()}
},25000);
