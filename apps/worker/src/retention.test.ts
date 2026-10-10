import {afterEach,expect,it,vi} from 'vitest';
import {D1Repository,InMemoryRepository} from './repository';
import {runRetentionCleanup} from './retention';
import {createIntakeDatabase} from './v1-intake/test-utils';
import type {NormalizedMessage} from '@distilled/core';

afterEach(()=>vi.restoreAllMocks());
const now=new Date('2026-10-09T12:00:00Z');
const message=(expiresAt='2026-10-01T00:00:00Z')=>({id:'expired',rawPayloadKey:'archive/item',expiresAt} as NormalizedMessage);
it('retains failed R2 work after SQL expiry and retries it on the next cleanup',async()=>{
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  const repo=new InMemoryRepository();repo.rawMessages.set('expired',message());
  const remove=vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
  expect(await runRetentionCleanup(repo,{delete:remove},now)).toEqual({deleted:1,archivesDeleted:0,archiveDeleteFailures:1});
  expect(repo.rawMessages.size).toBe(0);
  expect(await repo.listPendingArchiveDeletions(now)).toEqual(['archive/item']);
  expect(await runRetentionCleanup(repo,{delete:remove},now)).toEqual({deleted:0,archivesDeleted:1,archiveDeleteFailures:0});
  expect(await repo.listPendingArchiveDeletions(now)).toEqual([]);
});
it('does not delete SQL rows if journaling fails',async()=>{
  const repo=new InMemoryRepository();repo.rawMessages.set('expired',message());
  vi.spyOn(repo,'queueArchiveDeletion').mockRejectedValue(new Error('storage failure'));
  const remove=vi.fn();
  await expect(runRetentionCleanup(repo,{delete:remove},now)).rejects.toThrow('storage failure');
  expect(repo.rawMessages.size).toBe(1);expect(remove).not.toHaveBeenCalled();
});
it('keeps an object referenced by a live row even when an older deletion was queued',async()=>{
  const repo=new InMemoryRepository();await repo.queueArchiveDeletion('archive/item');
  repo.rawMessages.set('active',message('2026-11-01T00:00:00Z'));
  const remove=vi.fn();await runRetentionCleanup(repo,{delete:remove},now);
  expect(remove).not.toHaveBeenCalled();
});
it('persists pending deletion across D1 repository restarts and retries an uncertain acknowledgement',async()=>{
  const ctx=await createIntakeDatabase({product:true});
  vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const first=new D1Repository(ctx.db);await first.queueArchiveDeletion('archive/item',now);
    const second=new D1Repository(ctx.db),remove=vi.fn().mockResolvedValue(undefined);
    vi.spyOn(second,'completeArchiveDeletion').mockRejectedValueOnce(new Error('ack lost'));
    expect((await runRetentionCleanup(second,{delete:remove},now)).archiveDeleteFailures).toBe(1);
    const third=new D1Repository(ctx.db);
    expect(await third.listPendingArchiveDeletions(now)).toEqual(['archive/item']);
    expect((await runRetentionCleanup(third,{delete:remove},now)).archivesDeleted).toBe(1);
    expect(await new D1Repository(ctx.db).listPendingArchiveDeletions(now)).toEqual([]);
    expect(remove).toHaveBeenCalledTimes(2);
  }finally{await ctx.dispose();}
},30000);
