import type {RematchRequest,RematchAttempt} from './rematch';
import {rematchExhausted} from './rematch';
/** Diagnostics only. No expiry, editorial ranking or publication decision. */
export function semanticBacklogMetrics(requests:RematchRequest[],attempts:RematchAttempt[],protectedIds:Set<string>,now:string,intervalMinutes:number){
 const histories=new Map<string,RematchAttempt[]>();for(const a of attempts){const h=histories.get(a.requestId)??[];h.push(a);histories.set(a.requestId,h)}
 const outstanding=requests.filter(r=>!histories.get(r.id)?.some(a=>a.state==='SUCCEEDED')),ages=outstanding.map(r=>Math.max(0,Date.parse(now)-Date.parse(r.createdAt))).sort((a,b)=>a-b),protectedAges=outstanding.filter(r=>protectedIds.has(r.evidenceRevisionId)).map(r=>Math.max(0,Date.parse(now)-Date.parse(r.createdAt))),oldestMs=ages.at(-1)??0,p95Ms=ages.length?ages[Math.min(ages.length-1,Math.ceil(ages.length*.95)-1)]:0,oldestProtectedMs=Math.max(0,...protectedAges),exhausted=outstanding.filter(r=>rematchExhausted(histories.get(r.id)??[])).length;
 return {outstanding:outstanding.length,eligibleForReconsideration:outstanding.length-exhausted,exhausted,protectedOutstanding:protectedAges.length,medianMs:ages.length?ages[Math.floor(ages.length/2)]:0,p95Ms,oldestMs,oldestProtectedMs,ordinaryLatencyWarning:p95Ms>intervalMinutes*120000||oldestMs>86400000,ordinaryLatencyCritical:oldestMs>172800000,correctionLatencyWarning:oldestProtectedMs>intervalMinutes*60000,correctionLatencyCritical:oldestProtectedMs>86400000};
}
