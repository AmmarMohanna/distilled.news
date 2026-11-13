import {expect,it,vi} from 'vitest';
import {lovinAccessProbe} from './lovin-access-probe';
import type {ProviderHttpPort} from '@distilled/connectors';
it('bounds each of two immutable phases and uses durable HTTP rather than direct provider fetch',async()=>{
 const request=vi.fn<ProviderHttpPort['request']>(async()=>({status:200,headers:{},bytes:new Uint8Array(),json:{statusCode:403}}));
 const http={request} as unknown as ProviderHttpPort;
 for(const phase of ['homepage','article'] as const)await lovinAccessProbe(http,'secret','owner',{probeId:'fixed-probe',phase,url:phase==='homepage'?'https://lovin.co/':'https://lovin.co/beirut/story/'},0.05);
 expect(request).toHaveBeenCalledTimes(2);
 expect(request.mock.calls.map(call=>call[1])).toEqual(['["lovin-access-probe-v1","fixed-probe","homepage"]','["lovin-access-probe-v1","fixed-probe","article"]']);
 expect(request.mock.calls.every(call=>call[2]==='zyte'&&call[3]===0.05)).toBe(true);
});
it.each(['https://foreign.example/','https://127.0.0.1/','https://lovin.co.evil.example/'])('rejects a non-Lovin target before a paid operation (%s)',async url=>{
 const request=vi.fn();await expect(lovinAccessProbe({request} as unknown as ProviderHttpPort,'secret','owner',{probeId:'fixed-probe',phase:'homepage',url},0.05)).rejects.toThrow();expect(request).not.toHaveBeenCalled();
});
it('rejects a ceiling above the approved per-operation maximum',async()=>{
 const request=vi.fn();await expect(lovinAccessProbe({request} as unknown as ProviderHttpPort,'secret','owner',{probeId:'fixed-probe',phase:'homepage',url:'https://lovin.co/'},0.10)).rejects.toThrow();expect(request).not.toHaveBeenCalled();
});
