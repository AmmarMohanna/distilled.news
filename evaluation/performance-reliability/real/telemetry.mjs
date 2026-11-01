/** Low-cardinality OTLP gauges. No run/feed/user IDs, URLs or prompts as labels. */
export function metricsPayload(m,s,now=Date.now(),traffic=null){
 const names={workerCpuMs:'worker_cpu_ms',databaseRowsRead:'database_rows_read',databaseRowsWritten:'database_rows_written',queueBacklog:'queue_backlog_approximate',offered:'opportunities_offered',completed:'opportunities_completed',publishedReadback:'publications_read_back',unresolved:'opportunities_unresolved',byDeadlineRate:'by_deadline_ratio',backlog:'pending_jobs',oldestPendingMs:'oldest_pending_ms',modelCalls:'model_calls',settledUsd:'settled_usd',outstandingReservedUsd:'held_usd',uncertainOperations:'uncertain_operations',safetyViolations:'safety_violations'};
 const attributes=[{key:'environment',value:{stringValue:'staging'}},{key:'profile',value:{stringValue:m.profile}},{key:'slot',value:{stringValue:'isolated-campaign'}}];
 const extra={observation_timestamp_seconds:now/1000,configured_users:m.users,configured_feeds:m.users*m.feedsPerUser,configured_max_vus:m.maxVus};
 if(traffic?.metrics){
  // --summary-export on installed k6 versions can be flat; handleSummary-style
  // artifacts use values. Preserve absent measurements instead of making zero.
  const metric=name=>traffic.metrics[name]?.values??traffic.metrics[name];
  for(const [k,v]of Object.entries(metric('http_req_duration')??{}))if(['p(50)','p(95)','p(99)'].includes(k))extra['http_latency_'+k.replace(/[^0-9]/g,'')+'_ms']=v;
  extra.http_requests=metric('http_reqs')?.count;
  extra.http_requests_per_second=metric('http_reqs')?.rate;
  extra.http_observed_max_vus=metric('vus')?.max;
  extra.http_error_ratio=metric('http_req_failed')?.rate??metric('http_req_failed')?.value;
 }

 const metrics=Object.entries(names).flatMap(([key,name])=>typeof s[key]==='number'&&Number.isFinite(s[key])&&(!['modelCalls','settledUsd','outstandingReservedUsd','uncertainOperations'].includes(key)||s.financialCoverageComplete===true)?[{name:'distilled_campaign_'+name,gauge:{dataPoints:[{attributes,timeUnixNano:String(BigInt(now)*1000000n),asDouble:s[key]}]}}]:[]);
 for(const [name,value]of Object.entries(extra))if(typeof value==='number'&&Number.isFinite(value))metrics.push({name:'distilled_campaign_'+name,gauge:{dataPoints:[{attributes,timeUnixNano:String(BigInt(now)*1000000n),asDouble:value}]}});
 return {resourceMetrics:[{resource:{attributes:[{key:'service.name',value:{stringValue:'distilled-staging-campaign'}}]},scopeMetrics:[{scope:{name:'distilled-real-campaign',version:'1'},metrics}]}]};
}
export async function exportMetrics(m,s,env,fetcher=fetch){
 const url=new URL(env.CAMPAIGN_GRAFANA_OTLP_URL);
 if(url.protocol!=='https:'||!/^otlp-gateway-[a-z0-9-]+\.grafana\.net$/.test(url.hostname)||url.pathname!=='/otlp/v1/metrics'||url.search||!env.CAMPAIGN_GRAFANA_AUTH)throw Error('PRIVATE_GRAFANA_METRICS_CONFIGURATION');
 const r=await fetcher(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{authorization:env.CAMPAIGN_GRAFANA_AUTH,'content-type':'application/json'},body:JSON.stringify(metricsPayload(m,s))});
 if(!r.ok)throw Error('GRAFANA_METRIC_EXPORT_FAILED');
 const body=await r.text();if(body&&JSON.parse(body).partialSuccess?.rejectedDataPoints>0)throw Error('GRAFANA_METRICS_PARTIAL_REJECTION');
}
