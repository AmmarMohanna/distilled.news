import {expect,it,vi} from 'vitest';
import {SourceProviderError} from '@distilled/connectors';
import {admittedSourceExecution} from './source-execution-admission';
import {searchArticleChecks} from './source-search-helper';
vi.mock('./source-execution-admission',()=>({admittedSourceExecution:vi.fn()}));
it('waits for local capacity without submitting duplicate external requests',async()=>{
 vi.useFakeTimers();
 try{
  const admission=vi.mocked(admittedSourceExecution);
  admission.mockRejectedValueOnce(new SourceProviderError('BACKPRESSURE',undefined,{detail:'HELPER_LOCAL_CAPACITY_BUSY'}));
  admission.mockImplementationOnce(async(_db,run)=>run());
  const send=vi.fn<typeof fetch>(async()=>new Response('readable'));
  const run=searchArticleChecks({DB:{} as D1Database,SOURCE_EXECUTION_SERVICE:{fetch:send}},Date.now()+5000);
  const work=run(async fetcher=>(await fetcher('https://private.invalid',{signal:AbortSignal.timeout(4000)})).text());
  await vi.advanceTimersByTimeAsync(500);
  expect(await work).toBe('readable');expect(send).toHaveBeenCalledOnce();expect(admission).toHaveBeenCalledTimes(2);
 }finally{vi.useRealTimers();vi.resetAllMocks();}
});
it('never retries a submitted transport failure',async()=>{
 vi.mocked(admittedSourceExecution).mockImplementation(async(_db,run)=>run());
 const send=vi.fn<typeof fetch>(async()=>{throw Error('lost response');});
 const run=searchArticleChecks({DB:{} as D1Database,SOURCE_EXECUTION_SERVICE:{fetch:send}},Date.now()+5000);
 try{await expect(run(fetcher=>fetcher('https://private.invalid'))).rejects.toThrow('lost response');expect(send).toHaveBeenCalledOnce();}
 finally{vi.resetAllMocks();}
});
