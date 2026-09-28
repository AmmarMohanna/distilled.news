import {expect,it,vi} from 'vitest';
import {drainNextProcessingJob} from './processing-drain';
import type {ProcessingJobMessage} from './types';
import {InMemoryRepository} from './repository';
it('never fans out completed duplicate deliveries and does not undo completed data if queue admission fails',async()=>{
  const repo=new InMemoryRepository(),now=new Date();
  const done=await repo.createProcessingJob('feed','raw-1',now),next=await repo.createProcessingJob('feed','raw-2',now);
  await repo.completeProcessingJob(done,now);
  const queue={send:vi.fn(async(_message:ProcessingJobMessage)=>{})};
  await drainNextProcessingJob(repo,queue,'feed',false);expect(queue.send).not.toHaveBeenCalled();
  await drainNextProcessingJob(repo,queue,'feed',true);expect(queue.send).toHaveBeenCalledTimes(1);expect(queue.send.mock.calls[0][0]).toMatchObject({jobId:next});
  const failed={send:vi.fn(async()=>{throw Error('overloaded')})};
  await drainNextProcessingJob(repo,failed,'feed',true);
  expect((await repo.getProcessingJob(done))?.state).toBe('completed');expect((await repo.getProcessingJob(next))?.state).toBe('queued');
});
