import { expect, it } from 'vitest';
import { V1IntakeStore } from './store';
import { createIntakeDatabase, scopeFixture } from './test-utils';
it('scope survives a new store instance',async()=>{
  const ctx=await createIntakeDatabase();
  try { await new V1IntakeStore(ctx.db).registerScope(scopeFixture); expect(await new V1IntakeStore(ctx.db).getScope('feed-source-1')).toEqual(scopeFixture) }
  finally { await ctx.dispose() }
});
it('scope cannot be rebound to another feed or source',async()=>{
  const ctx=await createIntakeDatabase(); const store=new V1IntakeStore(ctx.db);
  try { await store.registerScope(scopeFixture); await expect(store.registerScope({...scopeFixture,sourceId:'attacker'})).rejects.toThrow(); expect((await store.getScope('feed-source-1'))?.sourceId).toBe('source-1') }
  finally { await ctx.dispose() }
});
it('disabled or deleted scope cannot accept work',async()=>{
  const ctx=await createIntakeDatabase(); const store=new V1IntakeStore(ctx.db);
  try {
    await store.registerScope(scopeFixture); const snapshot=await store.snapshot('feed-source-1');
    await store.registerScope({...scopeFixture,enabled:false});
    expect(await store.commit(snapshot,[{table:'jobs',id:'blocked',value:{}}])).toBe(false);
    expect(await store.read('jobs','blocked')).toBeUndefined();
    await expect(store.snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
    await store.registerScope({...scopeFixture,deletedAt:'2026-10-03T12:00:00Z'});
    await expect(store.snapshot('feed-source-1')).rejects.toMatchObject({code:'SCOPE_DENIED'});
  } finally { await ctx.dispose() }
});
