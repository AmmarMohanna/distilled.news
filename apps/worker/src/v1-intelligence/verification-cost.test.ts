import {expect,it} from 'vitest';
import {verificationCallBound,verificationCostEnvelope} from './verification-cost';
import {modelCapability,admitModelOperation} from './model-capacity';
it('bounds original plus one existing repair without inventing provider costs',()=>{
 expect([0,1,2,3,10].map(s=>verificationCallBound(s))).toEqual([0,2,2,6,90]);
 const capability=modelCapability('openai/gpt-4.1-mini')!;
 const admission=admitModelOperation('openai/gpt-4.1-mini',{test:'payload'},{type:'object'},capability);
 const report=verificationCostEnvelope([admission],{plannedPackets:1,cachedPackets:0,newAuthorizedCalls:0,unavailablePackets:1});
 expect(report.requestBytes).toBe(admission.requestBytes);expect(report.reservationCeilingUsd).toBe(admission.reservationCostUsd);expect(report.actualProviderCostUsd).toBeNull();expect(report.newAuthorizedCalls).toBe(0);
 expect(report.configuredAbsolutePerPacketCeilingUsd).toBeCloseTo(.458352,6);
});
