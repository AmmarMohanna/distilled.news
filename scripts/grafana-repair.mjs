import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
// Native PowerShell reads the existing protected files and pipes them to stdin.
// Credentials never appear in argv, a new local file, or diagnostic output.
const env={};for(const raw of JSON.parse(readFileSync(0,'utf8')).files){if(typeof raw!=='string')throw Error('GRAFANA_SECRET_FILE_UNAVAILABLE');for(const line of raw.split(/\r?\n/)){const m=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&m[2])env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2')}}
const base=(env.GRAFANA_URL??'https://giganticmantel34.grafana.net').replace(/\/$/,'');if(base!=='https://giganticmantel34.grafana.net'||!env.GRAFANA_SERVICE_ACCOUNT_TOKEN)throw Error('GRAFANA_ACCESS_UNAVAILABLE');
async function api(path,body,method=body?'POST':'GET'){const response=await fetch(base+path,{method,redirect:'manual',headers:{authorization:'Bearer '+env.GRAFANA_SERVICE_ACCOUNT_TOKEN,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('GRAFANA_HTTP_'+response.status+'_'+path.split('?')[0]);return response.json()}
const dataSources=await api('/api/datasources');const prometheus=dataSources.find(s=>s.type==='prometheus');if(!prometheus)throw Error('PROMETHEUS_NOT_FOUND');
const folder='distilled-staging-ops',mode=process.argv[2]??'inspect';
const scope=expr=>expr.replace(/\b(distilled_eval_[a-z_]+)(\{)?/g,(_m,name,brace)=>name+'{review_protocol="atomic-development-review-v2"'+(brace?',':'}'));
if(['rules','enable-rules'].includes(mode)){
 const existing=await api('/api/v1/provisioning/alert-rules');
 for(const spec of JSON.parse(readFileSync('ops/observability/technical-alerts.json','utf8'))){
  const data=[{refId:'A',relativeTimeRange:{from:1800,to:0},datasourceUid:prometheus.uid,model:{refId:'A',expr:scope(spec.expression),instant:true,intervalMs:60000,maxDataPoints:43200,queryType:'instant',format:'time_series'}},{refId:'C',relativeTimeRange:{from:0,to:0},datasourceUid:'__expr__',model:{refId:'C',type:'classic_conditions',conditions:[{evaluator:{type:'gt',params:[0]},operator:{type:'and'},query:{params:['A']},reducer:{type:'last',params:[]},type:'query'}]}}];
  const rule={uid:spec.uid,title:spec.title,folderUID:folder,ruleGroup:'distilled-technical-health',condition:'C',data,noDataState:'NoData',execErrState:'Error',for:'10m',labels:{service:'distilled',environment:'staging',severity:'warning'},annotations:{summary:spec.summary},isPaused:mode!=='enable-rules'};
  const prior=existing.find(r=>r.uid===spec.uid);if(prior&&prior.folderUID!==folder)throw Error('RULE_SCOPE_MISMATCH');
  await api('/api/v1/provisioning/alert-rules'+(prior?'/'+spec.uid:''),rule,prior?'PUT':'POST');
  const preview=await api('/api/v1/eval',{data,condition:'C',now:new Date().toISOString()});
  console.log(JSON.stringify({rule:spec.uid,paused:rule.isPaused,preview:preview.condition??preview.state??'evaluated',dataKeys:Object.keys(preview.data??{})}));
 }
}
if(mode==='sync')for(const file of ['evaluation/briefing-quality/worker/observability/dashboard.json','ops/observability/deployment-dashboard.json']){
 const dashboard=JSON.parse(readFileSync(file,'utf8'));delete dashboard.__inputs;
 const rendered=JSON.parse(JSON.stringify(dashboard).replaceAll('${DS_PROMETHEUS}',prometheus.uid));
 for(const panel of rendered.panels??[])for(const target of panel.targets??[])if(target.expr)target.expr=scope(target.expr);
 const result=await api('/api/dashboards/db',{dashboard:rendered,folderUid:folder,overwrite:true,message:'Repair current evaluation and deployment-wide operations visibility'});
 console.log(JSON.stringify({dashboard:dashboard.uid,status:result.status,url:base+result.url}));
}
const dashboards=(await api('/api/search?type=dash-db')).filter(d=>d.uid?.startsWith('distilled')).map(d=>({uid:d.uid,title:d.title,folderUid:d.folderUid}));
const query=async expr=>{expr=scope(expr);const result=await api('/api/datasources/proxy/uid/'+encodeURIComponent(prometheus.uid)+'/api/v1/query?query='+encodeURIComponent(expr));return {expression:expr,status:result.status,series:result.data?.result?.map(r=>({metric:r.metric,value:r.value}))}};
const metrics=[];for(const expr of ['last_over_time(distilled_eval_reviewed[1h])','last_over_time(distilled_eval_last_successful_review_timestamp_seconds[1h])','last_over_time(distilled_eval_spending_fenced[1h])','last_over_time(distilled_deployment_scope[1h])','last_over_time(distilled_deployment_pending_briefings[1h])','last_over_time(distilled_observer_up[1h])'])metrics.push(await query(expr));
for(const spec of JSON.parse(readFileSync('ops/observability/technical-alerts.json','utf8')))metrics.push({...await query(spec.expression),rule:spec.uid});
const rules=(await api('/api/v1/provisioning/alert-rules')).filter(r=>r.folderUID===folder).map(r=>({uid:r.uid,title:r.title,isPaused:r.isPaused}));
const result={at:new Date().toISOString(),datasource:{uid:prometheus.uid,name:prometheus.name},dashboards,metrics,rules};mkdirSync('.local-reports/evaluator-repair-20261111',{recursive:true});writeFileSync('.local-reports/evaluator-repair-20261111/grafana-'+mode+'.private.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
