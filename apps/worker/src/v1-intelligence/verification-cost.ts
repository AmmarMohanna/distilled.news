import type {ModelAdmission} from './model-capacity';
/** Worst-case pair coverage for each of original and at most one repair. */
export function verificationCallBound(stories:number){
 if(!Number.isSafeInteger(stories)||stories<0)throw Error('INVALID_STORY_COUNT');
 return stories===0?0:stories===1?2:stories*(stories-1);
}
export function verificationCostEnvelope(admissions:ModelAdmission[],counts:{plannedPackets:number;cachedPackets:number;newAuthorizedCalls:number;unavailablePackets:number}){
 for(const n of Object.values(counts))if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_PACKET_COUNT');
 const capability=admissions[0]?.capability;
 return {...counts,requestBytes:admissions.reduce((n,a)=>n+a.requestBytes,0),reservationCeilingUsd:admissions.reduce((n,a)=>n+a.reservationCostUsd,0),actualProviderCostUsd:null,configuredAbsolutePerPacketCeilingUsd:capability?(capability.contextTokens-capability.maxOutputTokens)*capability.inputUsdPerToken+capability.maxOutputTokens*capability.outputUsdPerToken:null,measurement:'CONFIGURED_ENVELOPE_NOT_PROVIDER_CHARGE' as const};
}
