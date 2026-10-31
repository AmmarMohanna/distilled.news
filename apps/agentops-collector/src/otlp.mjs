import catalog from '../../../ops/observability/metric-catalog.json' with {type:'json'};

const names = new Set(catalog.metrics.map(m=>m.name));
export function metricsPayload(values, now, environment='staging') {
  if(!Number.isSafeInteger(now)||now<0||environment!=='staging')throw Error('INVALID_SCOPE');
  const entries=Object.entries(values);
  if(entries.length>80)throw Error('METRIC_LIMIT');
  return {resourceMetrics:[{resource:{attributes:[{key:'service.name',value:{stringValue:'distilled-snapshot'}}]},scopeMetrics:[{scope:{name:'distilled.agentops',version:'1'},metrics:entries.map(([key,value])=>{
    const name='distilled_'+key;
    if(!names.has(name)||typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('INVALID_METRIC');
    // Gauges replace snapshots. No unit suffix conversion, counters or private labels.
    return {name,gauge:{dataPoints:[{timeUnixNano:String(BigInt(now)*1000000n),asDouble:value,attributes:[
      {key:'job',value:{stringValue:'distilled-snapshot'}},
      {key:'environment',value:{stringValue:environment}},
      {key:'service',value:{stringValue:'distilled-news-staging'}},
    ]}]}};
  })}]}]};
}
export async function sendMetrics(env, values, now, fetcher=fetch) {
  const url=new URL(env.GRAFANA_OTLP_METRICS_URL);
  if(url.protocol!=='https:'||url.hostname!=='otlp-gateway-prod-eu-west-2.grafana.net'||url.pathname!=='/otlp/v1/metrics'||url.search||url.username||url.password||url.port||!env.GRAFANA_OTLP_AUTH)throw Error('DESTINATION_NOT_ADMITTED');
  const body=JSON.stringify(metricsPayload(values,now));
  if(new TextEncoder().encode(body).length>64000)throw Error('BODY_LIMIT');
  const response=await fetcher(url.href,{method:'POST',redirect:'error',headers:{authorization:env.GRAFANA_OTLP_AUTH,'content-type':'application/json'},body,signal:AbortSignal.timeout(10000)});
  // A lost/rejected export is not retried; it must not create a retry storm.
  if(!response.ok){await response.body?.cancel();throw Error('INGEST_REJECTED');}
  const reader=response.body?.getReader();let text='',size=0;
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('INGEST_RESPONSE_LIMIT');text+=new TextDecoder().decode(value,{stream:true});}}finally{await reader.cancel().catch(()=>{});}
  if(text){const result=JSON.parse(text);if(result.partialSuccess?.rejectedDataPoints>0||result.partialSuccess?.errorMessage)throw Error('INGEST_PARTIAL');}
  return {points:Object.keys(values).length,bytes:new TextEncoder().encode(body).length};
}
