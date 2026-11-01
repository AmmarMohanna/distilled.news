import {check} from './protocol';

/** Only fixed aggregate series cross the Grafana boundary. Never evidence,
 * feed/user IDs, URLs, prompts, findings, or arbitrary attributes. */
export function metricsPayload(exposition:string,at:number){
 const points=[];
 for(const line of exposition.split('\n')){
  if(!line||line.startsWith('#'))continue;
  const match=line.match(/^(distilled_eval_[a-z_]+)(?:\{language="(en|ar|fr|other)"(?:,status="([a-z_]+)")?\})? ([\d.e+-]+)$/);
  check(match,'METRIC_NOT_ADMITTED');const value=Number(match[4]);check(Number.isFinite(value)&&value>=0,'INVALID_METRIC_VALUE');
  const attributes=[{key:'environment',value:{stringValue:'staging'}}];if(match[2])attributes.push({key:'language',value:{stringValue:match[2]}});if(match[3])attributes.push({key:'status',value:{stringValue:match[3]}});
  points.push({name:match[1],gauge:{dataPoints:[{timeUnixNano:String(BigInt(at)*1000000n),asDouble:value,attributes}]}});
 }
 check(points.length>0&&points.length<=200,'METRIC_LIMIT');
 return {resourceMetrics:[{resource:{attributes:[{key:'service.name',value:{stringValue:'distilled-briefing-quality'}}]},scopeMetrics:[{scope:{name:'distilled.evaluation',version:'1'},metrics:points}]}]};
}
export async function exportGrafana(env:Env,exposition:string,fetcher:typeof fetch=fetch){
 if(env.GRAFANA_EXPORT_ENABLED!=='true')return {status:'disabled'};
 const authorization=env.GRAFANA_OTLP_AUTH||(env.GRAFANA_OTLP_INSTANCE_ID&&env.GRAFANA_INGEST_TOKEN?'Basic '+btoa(env.GRAFANA_OTLP_INSTANCE_ID+':'+env.GRAFANA_INGEST_TOKEN):undefined);
 check(authorization,'GRAFANA_AUTH_MISSING');
 const configuredBase=env.GRAFANA_OTLP_BASE_URL?.replace(/\/$/,'');
 const base=configuredBase&&!configuredBase.includes('://')?'https://'+configuredBase:configuredBase;
 const url=new URL(base?(base.endsWith('/v1/metrics')?base:base+'/v1/metrics'):env.GRAFANA_OTLP_METRICS_URL);
 check(url.protocol==='https:'&&url.hostname==='otlp-gateway-prod-eu-west-2.grafana.net'&&url.pathname==='/otlp/v1/metrics'&&!url.port&&!url.search&&!url.username&&!url.password,'GRAFANA_DESTINATION_NOT_ADMITTED');
 const payload=metricsPayload(exposition,Date.now()),body=JSON.stringify(payload);check(new TextEncoder().encode(body).length<=64000,'GRAFANA_BODY_LIMIT');
 const response=await fetcher(url.href,{method:'POST',redirect:'manual',headers:{authorization,'content-type':'application/json'},body,signal:AbortSignal.timeout(10000)});
 check(response.ok,'GRAFANA_EXPORT_REJECTED');
 const reader=response.body?.getReader();let raw='',bytes=0;
 if(reader)try{const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;check(bytes<=8192,'GRAFANA_RESPONSE_LIMIT');raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
 if(raw){const result=JSON.parse(raw) as {partialSuccess?:{rejectedDataPoints?:number|string;errorMessage?:string}};check(Number(result.partialSuccess?.rejectedDataPoints??0)===0&&!result.partialSuccess?.errorMessage,'GRAFANA_PARTIAL_EXPORT')}
 return {status:'exported',at:new Date().toISOString()};
}
