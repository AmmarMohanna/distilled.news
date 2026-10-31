/** Bounded control-plane reads only. Does not provision, deploy, query articles,
 * write telemetry, send queues, or contact model/source providers. */
export async function inspectResources(m,env,fetcher=fetch,now=new Date()){
 const account=env.CAMPAIGN_CLOUDFLARE_ACCOUNT;
 if(!/^[a-f0-9]{32}$/.test(account??'')||!env.CAMPAIGN_CLOUDFLARE_TOKEN)throw Error('READ_ONLY_CLOUDFLARE_ACCESS_REQUIRED');
 const start=new Date(now);start.setUTCDate(1);start.setUTCHours(0,0,0,0);
 const query=`query { viewer { accounts(filter:{accountTag:"${account}"}) { workersInvocationsAdaptive(limit:1,filter:{datetime_geq:"${start.toISOString()}",datetime_leq:"${now.toISOString()}"}) { sum { requests cpuTimeUs } } d1AnalyticsAdaptiveGroups(limit:1,filter:{datetime_geq:"${start.toISOString()}",datetime_leq:"${now.toISOString()}"}) { sum { rowsRead rowsWritten } } } } }`;
 const result={schemaVersion:'distilled-resource-inventory.v1',observedAt:now.toISOString(),origin:m.origin,revision:m.revision,requests:[],status:'INVENTORY_ONLY_NOT_CAMPAIGN_APPROVAL'};
 const request=async(name,url,token,body)=>{
  const response=await fetcher(url,{method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{authorization:token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  let json;try{json=await response.json()}catch{}result.requests.push({name,status:response.status});return response.ok?json:null;
 };
 const cf=await request('account_usage','https://api.cloudflare.com/client/v4/graphql','Bearer '+env.CAMPAIGN_CLOUDFLARE_TOKEN,{query});
 result.accountUsage=cf?.data?.viewer?.accounts?.[0]??null;result.usageErrors=cf?.errors?.map(e=>({code:e.extensions?.code??null}))??[];
 const worker=new URL(m.origin).hostname.split('.')[0];
 const settings=await request('isolated_worker','https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+worker+'/settings','Bearer '+env.CAMPAIGN_CLOUDFLARE_TOKEN);
 const value=settings?.result;result.worker=value?{exists:true,notificationsConfigured:(value.bindings??[]).some(b=>b.name==='VAPID_PRIVATE_KEY'),resources:(value.bindings??[]).filter(b=>['d1','r2_bucket','queue'].includes(b.type)).map(b=>({type:b.type,name:b.name,id:b.id??b.queue_id??b.bucket_name??null}))}:{exists:result.requests.find(r=>r.name==='isolated_worker')?.status===404?false:null,status:result.requests.find(r=>r.name==='isolated_worker')?.status===404?'NOT_PROVISIONED':'UNVERIFIED'};
 if(env.CAMPAIGN_GRAFANA_SERVICE_TOKEN){
  const root='https://giganticmantel34.grafana.net/api/datasources/proxy/uid/grafanacloud-usage/api/v1/query?query=';
  result.grafana={};for(const metric of ['grafanacloud_org_metrics_billable_series','grafanacloud_org_metrics_included_series','grafanacloud_org_traces_usage','grafanacloud_org_traces_included_usage']){
   const gf=await request(metric,root+encodeURIComponent(metric),'Bearer '+env.CAMPAIGN_GRAFANA_SERVICE_TOKEN);
   result.grafana[metric]=gf?.data?.result?.map(r=>({at:r.value?.[0],value:r.value?.[1]}))??null;
  }
 }
 return result;
}
