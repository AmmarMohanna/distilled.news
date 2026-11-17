import {afterEach,expect,it,vi} from 'vitest';
import {sourceStreamHeartbeat} from './source-stream-heartbeat';
afterEach(()=>vi.useRealTimers());
it('keeps an idle stream active and stops all timers when the handler finishes',async()=>{
 vi.useFakeTimers();const write=vi.fn(async()=>{});const output={write,aborted:false};const stop=sourceStreamHeartbeat(output);
 expect(write).toHaveBeenCalledWith('\n');await vi.advanceTimersByTimeAsync(20_000);expect(write).toHaveBeenCalledTimes(3);
 output.aborted=true;await vi.advanceTimersByTimeAsync(10_000);expect(write).toHaveBeenCalledTimes(3);
 await stop();await vi.advanceTimersByTimeAsync(20_000);expect(write).toHaveBeenCalledTimes(3);expect(vi.getTimerCount()).toBe(0);
});
it('awaits an outstanding write when the stream work finishes',async()=>{
 let release!:()=>void;const write=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));const stop=sourceStreamHeartbeat({write,aborted:false});
 let stopped=false;const completion=stop().then(()=>{stopped=true;});await Promise.resolve();expect(stopped).toBe(false);release();await completion;expect(stopped).toBe(true);
});
