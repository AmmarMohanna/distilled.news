import {reserveControlPlane} from './control-budget.mjs';
/** Exact dedicated resources and bounded time range; no SQL or source reads. */
export async function observeResources(m,target,dir,env,from,until,fetcher=fetch){
 const worker=new URL(m.origin).hostname.split('.')[0];
 if(target.runId!==m.runId||target.worker!==worker||target.isolated!==true||!/^[a-f0-9]{32}$/.test(target.accountId)||!/^[a-f0-9-]{36}$/.test(target.databaseId)||!Array.isArray(target.queueIds)||target.queueIds.length<1||target.queueIds.length>3||target.queueIds.some(id=>!/^[a-f0-9]{32}$/.test(id)))throw Error('ISOLATED_RESOURCE_BINDING');
 if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(until))||Date.parse(until)<=Date.parse(from)||Date.parse(until)-Date.parse(from)>4*3600000)throw Error('BOUNDED_RESOURCE_TIME_REQUIRED');
 const request=async(path,body)=>{
  reserveControlPlane(m,dir,'resource-read');if(!env.CAMPAIGN_CLOUDFLARE_TOKEN)throw Error('RESOURCE_READ_PERMISSION_REQUIRED');
  const r=await fetcher('https://api.cloudflare.com/client/v4'+path,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.CAMPAIGN_CLOUDFLARE_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error('RESOURCE_READ_UNAVAILABLE');const data=await r.json();if(data.errors?.length)throw Error('RESOURCE_ANALYTICS_UNAVAILABLE');return data;
 };
 const query=`query {viewer {accounts(filter:{accountTag:"${target.accountId}"}) {workersInvocationsAdaptive(limit:1,filter:{scriptName:"${worker}",datetime_geq:"${from}",datetime_leq:"${until}"}) {sum {requests errors cpuTimeUs}} d1AnalyticsAdaptiveGroups(limit:1,filter:{databaseId:"${target.databaseId}",datetime_geq:"${from}",datetime_leq:"${until}"}) {sum {rowsRead rowsWritten readQueries writeQueries}}}}}`;
 const json=await request('/graphql',{query});const account=json.data?.viewer?.accounts?.[0];
 const queues=[];for(const id of target.queueIds){const q=await request('/accounts/'+target.accountId+'/queues/'+id+'/metrics');const v=q.result;queues.push({queueId:id,approximate:true,backlog:v?.backlog_count??null,bytes:v?.backlog_bytes??null,oldestPendingMs:v?.oldest_message_timestamp_ms>0?Math.max(0,Date.now()-v.oldest_message_timestamp_ms):null});}
 return {observedAt:new Date().toISOString(),from,until,worker:account?.workersInvocationsAdaptive?.[0]?.sum??null,database:account?.d1AnalyticsAdaptiveGroups?.[0]?.sum??null,queues,analyticsMayLag:true};
}
