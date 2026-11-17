import {it,expect,vi} from 'vitest';
import {withIntelligenceTurn} from './connector-intelligence-turn';
import {withLatency} from './v1-intelligence/latency';
import type {Env} from './types';
const body={type:'v1_briefing' as const,feedId:'feed',window:{start:'2026-10-03T00:00:00.000Z',end:'2026-10-04T00:00:00.000Z',kind:'DAILY' as const}};
function environment(admitted=true){const statement:any={bind:()=>statement,first:async()=>({present:1}),run:async()=>({success:true})};return {SOURCE_QUEUE_SCHEDULING_ENABLED:'true',DB:{prepare:()=>statement,batch:async()=>[{results:[]},{results:admitted?[{feed_id:'feed'}]:[]}]}} as unknown as Env;}
it('captures publication admission and held duration outside the nested runtime measurement',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  expect(await withIntelligenceTurn(environment(),body,()=>withLatency({feedId:'feed',phase:'PUBLICATION'},async()=> 'done'))).toBe('done');
  const records=log.mock.calls.map(([s])=>JSON.parse(s)),turn=records.find(r=>r.phase==='PUBLICATION_TURN');
  expect(turn).toMatchObject({feedId:'feed',outcome:'SUCCEEDED',stages:{FEED_TURN_ADMISSION:{count:1},FEED_TURN_HELD:{count:1}}});
  expect(turn.windowId).toMatch(/^[a-f0-9]{64}$/);expect(records.find(r=>r.phase==='PUBLICATION').windowId).toBe(turn.windowId);
  await withIntelligenceTurn(environment(),{...body,window:{...body.window,start:body.window.start.replace('.000',''),end:body.window.end.replace('.000','')}},async()=>undefined);
  expect(log.mock.calls.map(([s])=>JSON.parse(s)).filter(r=>r.phase==='PUBLICATION_TURN').map(r=>r.windowId)).toEqual([turn.windowId,turn.windowId]);
 }finally{log.mockRestore();}
});
it('reports busy publication admission without executing or logging transport payloads',async()=>{
 const log=vi.spyOn(console,'info').mockImplementation(()=>{}),run=vi.fn();
 try{await expect(withIntelligenceTurn(environment(false),body,run)).rejects.toThrow('INTELLIGENCE_TURN_BUSY');expect(run).not.toHaveBeenCalled();const record=log.mock.calls.map(([s])=>JSON.parse(s)).find(r=>r.phase==='PUBLICATION_TURN');expect(record).toMatchObject({outcome:'FAILED',counts:{feedTurnBusy:1}});expect(record.stages.FEED_TURN_HELD).toBeUndefined();expect(JSON.stringify(record)).not.toContain(body.window.start);}finally{log.mockRestore();}
});
