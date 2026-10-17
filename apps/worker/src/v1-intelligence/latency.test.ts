import {expect,it,vi} from 'vitest';
import {withLatency,measureLatency,countLatency} from './latency';

it('aggregates stage duration/counts and emits only permitted correlation fields',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  const result=await withLatency({feedId:'f',reviewId:'r',phase:'REVIEW'},async()=>{
   countLatency('evidence',3);
   await measureLatency('GRAPH_LOAD',async()=>42);
   await measureLatency('GRAPH_LOAD',async()=>43);
   return 'done';
  });
  expect(result).toBe('done');
  const record=JSON.parse(log.mock.calls.at(-1)![0]);
  expect(record).toMatchObject({type:'V1_PIPELINE_LATENCY',feedId:'f',reviewId:'r',phase:'REVIEW',outcome:'SUCCEEDED',counts:{evidence:3},stages:{GRAPH_LOAD:{count:2}}});
  expect(record.durationMs).toBeGreaterThanOrEqual(0);
  expect(record.stages.GRAPH_LOAD.durationMs).toBeGreaterThanOrEqual(0);
 }finally{log.mockRestore()}
});

it('records failures without logging the error or losing an outer correlation',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  await expect(withLatency({feedId:'f',reviewId:'r',phase:'REVIEW'},()=>measureLatency('MODEL',async()=>{throw Error('private article and token')}))).rejects.toThrow('private article and token');
  const raw=String(log.mock.calls.at(-1)![0]);
  expect(JSON.parse(raw)).toMatchObject({outcome:'FAILED',stages:{MODEL:{count:1}}});
  expect(raw).not.toContain('private');expect(raw).not.toContain('token');
 }finally{log.mockRestore()}
});

it('keeps concurrent feed measurements isolated and ignores nonfinite counts',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  await Promise.all(['a','b'].map(feedId=>withLatency({feedId,phase:'REVIEW'},async()=>{await Promise.resolve();countLatency('items',feedId==='a'?1:2);countLatency('bad',NaN)})));
  const records=log.mock.calls.map(([raw])=>JSON.parse(raw));
  expect(records.find(r=>r.feedId==='a').counts).toEqual({items:1});
  expect(records.find(r=>r.feedId==='b').counts).toEqual({items:2});
 }finally{log.mockRestore()}
});
