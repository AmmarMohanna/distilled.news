import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {writePrivate,journal} from './client.mjs';
import {reserveControlPlane} from './control-budget.mjs';
/** Exact dedicated resources and bounded time range; no SQL or source reads. */
export async function observeResources(m,target,dir,env,from,until,fetcher=fetch){
 const worker=new URL(m.origin).hostname.split('.')[0];
 if(target.runId!==m.runId||target.worker!==worker||target.isolated!==true||!/^[a-f0-9]{32}$/.test(target.accountId)||!/^[a-f0-9-]{36}$/.test(target.databaseId)||!Array.isArray(target.queueIds)||target.queueIds.length<1||target.queueIds.length>5||target.queueIds.some(id=>!/^[a-f0-9]{32}$/.test(id)))throw Error('ISOLATED_RESOURCE_BINDING');
 if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from)||Date.parse(until)-Date.parse(from)>4*3600000)throw Error('BOUNDED_RESOURCE_TIME_REQUIRED');
 const request=async(path,body,attempt=0)=>{
  reserveControlPlane(m,dir,'resource-read');if(!env.CAMPAIGN_CLOUDFLARE_TOKEN)throw Error('RESOURCE_READ_PERMISSION_REQUIRED');
  const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.CAMPAIGN_CLOUDFLARE_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error('RESOURCE_READ_UNAVAILABLE');const data=await r.json();if(data.errors?.length){
   const codes=data.errors.map(e=>String(e.extensions?.code??e.code??'UNCLASSIFIED')).map(c=>/^[A-Za-z0-9_:.-]{1,64}$/.test(c)?c:'UNCLASSIFIED');
   journal(dir,{category:'resource-analytics-read-failed',attempt:attempt+1,errorCodes:codes});
   // Only this idempotent metrics read gets one bounded retry. No provider,
   // source, queue mutation or paid operation can use this retry path.
   if(path==='/graphql'&&attempt===0){await new Promise(r=>setTimeout(r,1000));return request(path,body,1);}
   throw Error('RESOURCE_ANALYTICS_UNAVAILABLE');
  }return data;
 };
 const query=`query {viewer {accounts(filter:{accountTag:"${target.accountId}"}) {workersInvocationsAdaptive(limit:1,filter:{scriptName:"${worker}",datetime_geq:"${from}",datetime_leq:"${until}"}) {sum {requests errors cpuTimeUs}} d1AnalyticsAdaptiveGroups(limit:1,filter:{databaseId:"${target.databaseId}",datetime_geq:"${from}",datetime_leq:"${until}"}) {sum {rowsRead rowsWritten readQueries writeQueries}}}}}`;
 const json=await request('/graphql',{query});const account=json.data?.viewer?.accounts?.[0];
 const cachePath=resolve(dir,'queue-age-bounds.private.json');
 let cache={};if(existsSync(cachePath)){try{const saved=JSON.parse(readFileSync(cachePath,'utf8'));if(saved.runId===m.runId&&saved.accountId===target.accountId)cache=saved.queues??{};}catch{/* A damaged receipt cannot supply an age. */}}
 const queues=[];for(const id of target.queueIds){
  const q=await request('/accounts/'+target.accountId+'/queues/'+id+'/metrics'),v=q.result,now=Date.now();
  const observation=queueAgeObservation(v,cache[id],now);if(observation.receipt)cache[id]=observation.receipt;
  queues.push({queueId:id,approximate:true,...observation.metrics});
 }
 writePrivate(dir,'queue-age-bounds.private.json',{runId:m.runId,accountId:target.accountId,queues:cache});
 return {observedAt:new Date().toISOString(),from,until,worker:account?.workersInvocationsAdaptive?.[0]?.sum??null,database:account?.d1AnalyticsAdaptiveGroups?.[0]?.sum??null,queues,analyticsMayLag:true};
}

/** A queue's unacknowledged oldest timestamp cannot move backwards as new messages
 * are enqueued and old ones acknowledged. Retaining an older native timestamp
 * therefore provides a conservative AGE UPPER BOUND, never an exact current age.
 * The receipt is private and campaign/account/queue scoped; no body is inspected.
 * Without any valid native timestamp the observation remains UNKNOWN. */
export function queueAgeObservation(value,previous,now){
 const count=Number.isSafeInteger(value?.backlog_count)&&value.backlog_count>=0?value.backlog_count:null;
 const bytes=Number.isSafeInteger(value?.backlog_bytes)&&value.backlog_bytes>=0?value.backlog_bytes:null;
 const timestamp=value?.oldest_message_timestamp_ms;
 const valid=n=>Number.isSafeInteger(n)&&n>0&&n<=now;
 const receipt=valid(timestamp)?{timestampMs:timestamp,observedAtMs:now}:undefined;
 const retained=valid(previous?.timestampMs)&&valid(previous?.observedAtMs)&&previous.timestampMs<=previous.observedAtMs?previous:null;
 const pending=count>0||bytes>0;
 const used=receipt??(pending?retained:null);
 return {receipt,metrics:{backlog:count,bytes,oldestPendingMs:used?now-used.timestampMs:null,
  ageSource:receipt?'NATIVE':used?'NATIVE_RETAINED_UPPER_BOUND':'UNKNOWN',
  ageIsUpperBound:!receipt&&!!used,
  ageMeasuredAt:new Date(now).toISOString(),
  ageEvidenceAt:used?new Date(used.observedAtMs).toISOString():null,
  state:count===null||bytes===null?'UNKNOWN':count===0&&bytes===0?'EMPTY':pending?'PENDING':'UNKNOWN'}};
}

/** Age cached readings as wall time advances; missing ages remain missing. */
export function queueSafetyStops(resources,stop,now=Date.now()){
 const observed=Date.parse(resources?.observedAt),reasons=[];
 if(!Array.isArray(resources?.queues)||!resources.queues.length)return ['QUEUE_BACKLOG_UNOBSERVABLE'];
 if(!Number.isFinite(observed)||observed>now)return ['QUEUE_OBSERVATION_TIME_UNOBSERVABLE'];
 if(now-observed>420000)reasons.push('QUEUE_OBSERVATION_STALE');
 for(const q of resources.queues){
  if(!Number.isSafeInteger(q.backlog)||q.backlog<0||!Number.isSafeInteger(q.bytes)||q.bytes<0)reasons.push('QUEUE_BACKLOG_UNOBSERVABLE');
  if(q.backlog>stop.maxBacklog)reasons.push('QUEUE_BACKLOG_LIMIT');
  const pending=q.backlog>0||q.bytes>0;
  const measured=Date.parse(q.ageMeasuredAt??resources.observedAt);
  if(!Number.isFinite(measured)||measured>now){reasons.push('QUEUE_OBSERVATION_TIME_UNOBSERVABLE');continue;}
  if(pending&&(typeof q.oldestPendingMs!=='number'||!Number.isFinite(q.oldestPendingMs)))reasons.push('QUEUE_AGE_UNOBSERVABLE');
  if(typeof q.oldestPendingMs==='number'&&q.oldestPendingMs+now-measured>stop.oldestPendingMs)reasons.push('QUEUE_PENDING_AGE_LIMIT');
 }
 return [...new Set(reasons)];
}
