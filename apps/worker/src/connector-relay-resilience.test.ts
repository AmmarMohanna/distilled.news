import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const phases=vi.hoisted(()=>({ready:vi.fn(),acquire:vi.fn(),intelligence:vi.fn()}));
vi.mock('./connector-briefing-priority',()=>({dispatchReadyConnectorBriefing:phases.ready}));
vi.mock('./v1-downstream-runtime',async original=>({...await original<object>(),dispatchV1Acquisitions:phases.acquire}));
vi.mock('./v1-intelligence/runtime',async original=>({...await original<object>(),dispatchV1Intelligence:phases.intelligence}));
import {relayConnectorDownstream} from './connector-scheduling';
import type {Env} from './types';
const env={SOURCE_QUEUE_SCHEDULING_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'approved-source'} as Env;
beforeEach(()=>{for(const phase of Object.values(phases))phase.mockReset().mockResolvedValue(0);});
afterEach(()=>vi.restoreAllMocks());
it('dispatches review after acquisition dispatch rejects and preserves the original retry error',async()=>{
 const error=Error('private-provider-detail');phases.acquire.mockRejectedValue(error);
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 await expect(relayConnectorDownstream(env,'feed')).rejects.toBe(error);
 expect(phases.intelligence).toHaveBeenCalledExactlyOnceWith(env,expect.any(Date),{skipProviderAccountingRecovery:true});
 expect(phases.ready).toHaveBeenCalledExactlyOnceWith(env,'feed');
 expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-detail');
});
it('attempts acquisition and review after briefing dispatch rejects, then propagates the first error',async()=>{
 const first=Error('first-private-detail'),second=Error('second-private-detail');phases.ready.mockRejectedValue(first);phases.acquire.mockRejectedValue(second);
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 await expect(relayConnectorDownstream(env,'feed')).rejects.toBe(first);
 expect(phases.acquire).toHaveBeenCalledExactlyOnceWith(env);expect(phases.intelligence).toHaveBeenCalledOnce();
 expect(phases.ready.mock.invocationCallOrder[0]).toBeLessThan(phases.acquire.mock.invocationCallOrder[0]);
 expect(phases.acquire.mock.invocationCallOrder[0]).toBeLessThan(phases.intelligence.mock.invocationCallOrder[0]);
 expect(log).toHaveBeenCalledTimes(2);expect(JSON.stringify(log.mock.calls)).not.toContain('private-detail');
});
it('passes the same source-scoped environment through successful dispatch without executing queued acquisition work',async()=>{
 const submitted:string[]=[];
 phases.acquire.mockImplementation(async(actual:Env)=>{expect(actual).toBe(env);submitted.push('queued-acquisition');return 1;});
 phases.intelligence.mockImplementation(async(actual:Env)=>{expect(actual).toBe(env);expect(submitted).toEqual(['queued-acquisition']);return 1;});
 await expect(relayConnectorDownstream(env)).resolves.toBeUndefined();
 expect(phases.ready).not.toHaveBeenCalled();expect(phases.intelligence).toHaveBeenCalledOnce();
});
