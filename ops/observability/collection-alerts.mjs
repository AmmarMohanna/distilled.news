/** Mirror of connectorCollectionAlerts in apps/worker/src/connector-health.ts.
 * A worker test runs both over the same cases so the API, the feed page and
 * Grafana report the same sources. */
export const SOURCE_NO_SUCCESS_AFTER_MS=48*60*60*1000;
export const SOURCE_UNPROVEN_AFTER_CHECKS=3;
/** @param {{firstCheckedAt:string|null,lastCheckedAt:string|null,lastAcceptedAt:string|null,checks:number,observations:number}} h */
export function collectionAlertCodes(h,now=Date.now()){
 const codes=[];
 if(!h.lastCheckedAt)return codes;
 const since=h.lastAcceptedAt??h.firstCheckedAt;
 if(since&&Date.parse(h.lastCheckedAt)>(h.lastAcceptedAt?Date.parse(h.lastAcceptedAt):-Infinity)&&now-Date.parse(since)>SOURCE_NO_SUCCESS_AFTER_MS)codes.push('SOURCE_NO_RECENT_SUCCESS');
 if(h.observations===0&&h.checks>=SOURCE_UNPROVEN_AFTER_CHECKS)codes.push('SOURCE_NEVER_COLLECTED');
 return codes;
}
