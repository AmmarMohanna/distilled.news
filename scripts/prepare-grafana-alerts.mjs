import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
/** Convert file-provisioning format to HTTP API bodies; no network or credentials. */
export function prepareAlerts(document,{folderUID,metricsUID,logsUID,snapshotCadenceMinutes}){
 for(const uid of [folderUID,metricsUID,logsUID])if(typeof uid!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(uid))throw Error('EXPLICIT_DATASOURCE_AND_FOLDER_UIDS_REQUIRED');
 if(snapshotCadenceMinutes!==undefined&&(!Number.isSafeInteger(snapshotCadenceMinutes)||snapshotCadenceMinutes<1||snapshotCadenceMinutes>60))throw Error('INVALID_SNAPSHOT_CADENCE');
 const rules=document.groups.flatMap(group=>group.rules.map(rule=>({...rule,orgID:group.orgId,folderUID,ruleGroup:group.name,data:rule.data.map(query=>({...query,datasourceUid:query.datasourceUid==='distilled-metrics'?metricsUID:query.datasourceUid==='distilled-logs'?logsUID:query.datasourceUid,model:{...query.model,datasource:{uid:query.datasourceUid==='distilled-metrics'?metricsUID:query.datasourceUid==='distilled-logs'?logsUID:'__expr__',type:query.datasourceUid==='distilled-metrics'?'prometheus':query.datasourceUid==='distilled-logs'?'loki':'__expr__'}}}))})));
 return rules.map(rule=>{
  if(snapshotCadenceMinutes===undefined||!['distilled-snapshot-observer','distilled-snapshot-stale'].includes(rule.uid))return rule;
  const adjusted=structuredClone(rule),lookback=snapshotCadenceMinutes+5;
  adjusted.data.find(q=>q.refId==='A').model.expr=adjusted.data.find(q=>q.refId==='A').model.expr.replace(/distilled_(?:observer_up|snapshot_observed_timestamp_seconds)\{[^}]*\}/g,selector=>`last_over_time(${selector}[${lookback}m])`);
  if(rule.uid==='distilled-snapshot-stale')adjusted.data.find(q=>q.refId==='C').model.conditions[0].evaluator.params=[lookback*60];
  adjusted.annotations.description=`Provisional ${lookback}-minute freshness policy for a ${snapshotCadenceMinutes}-minute collector. Missing samples are not healthy zeroes. Alerts remain paused pending validation.`;
  return adjusted;
 });
}
export const productionAlertFolderUID='distilled-production-ops';

function productionMetricSelectors(expression){
 return expression.replace(/\b(distilled_[a-z0-9_]+)(\{)?/g,(_,name,brace)=>{
  const protocol=name.startsWith('distilled_eval_')?',review_protocol="atomic-development-review-v2"':'';
  return name+'{environment="production"'+protocol+(brace?',':'}');
 });
}

export function prepareProductionAlerts(provisional,technical,{metricsUID}){
 const technicalRules=technical.map(spec=>({
  uid:spec.uid,title:spec.title,condition:'C',noDataState:'NoData',execErrState:'Error',for:'10m',
  labels:{service:'distilled',severity:'warning'},annotations:{summary:spec.summary},
  data:[
   {refId:'A',relativeTimeRange:{from:1800,to:0},datasourceUid:'distilled-metrics',model:{refId:'A',expr:spec.expression,instant:true,intervalMs:60000,maxDataPoints:43200,queryType:'instant',format:'time_series'}},
   {refId:'C',relativeTimeRange:{from:0,to:0},datasourceUid:'__expr__',model:{refId:'C',type:'classic_conditions',conditions:[{evaluator:{type:'gt',params:[0]},operator:{type:'and'},query:{params:['A']},reducer:{type:'last',params:[]},type:'query'}]}}
  ]
 }));
 const sourceRules=provisional.groups.flatMap(group=>group.rules);
 const select=uid=>{
  const rule=sourceRules.find(source=>source.uid===uid);
  if(!rule)throw Error('PRODUCTION_ALERT_TEMPLATE_MISSING: '+uid);
  return structuredClone(rule);
 };
 const overdue=select('distilled-backlog');
 overdue.uid='distilled-overdue-briefings';
 overdue.title='Overdue briefing windows';
 overdue.annotations.summary='Some briefing windows are past their intended delivery time.';
 overdue.annotations.description='Review the retained overdue baseline before activation. This is a deployment-wide count.';
 overdue.annotations.runbook_url='https://github.com/AmmarMohanna/distilled.news/blob/main/docs/observability/RUNBOOKS.md#publication';
 overdue.data[0].model.expr='max(last_over_time(distilled_deployment_pending_briefings{job="distilled-snapshot"}[15m]))';
 overdue.data.find(q=>q.refId==='C').model.conditions[0].evaluator.params=[0];
 const stale=select('distilled-snapshot-stale');
 stale.data[0].model.expr='time() - max(last_over_time(distilled_snapshot_observed_timestamp_seconds{job="distilled-snapshot"}[30m]))';
 stale.data.find(q=>q.refId==='C').model.conditions[0].evaluator.params=[600];
 stale.annotations.description='Provisional ten-minute freshness threshold for the five-minute collector.';
 const unsettled=select('distilled-uncertain');
 const source=select('distilled-source-no-recent-success');
 for(const rule of [unsettled,source]){
  rule.annotations.description='Activation blocked pending verification of this series from the deployment-wide production collector.';
  const metric=rule.data[0].model.expr.match(/distilled_[a-z_]+\{[^}]+\}/)[0];
  rule.data[0].model.expr='sum(last_over_time('+metric+'[15m]))';
 }
 const rules=[...technicalRules,unsettled,overdue,source,stale].map(rule=>{
  const query=rule.data.find(q=>q.refId==='A');
  query.model.expr=productionMetricSelectors(query.model.expr);
  return {...rule,uid:rule.uid.replace(/^distilled-/,'distilled-prod-'),title:'Production · '+rule.title,isPaused:true,
   labels:{...rule.labels,environment:'production',threshold_status:'provisional'}};
 });
 return prepareAlerts({groups:[{orgId:1,name:'distilled-production-health',rules}]},
  {folderUID:productionAlertFolderUID,metricsUID,logsUID:'unused'});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=file=>JSON.parse(readFileSync(new URL('../ops/observability/'+file,import.meta.url),'utf8'));
 const input=read('grafana-alerts.json');
 const [folderOrMode,metricsUID,logsUID]=process.argv.slice(2);
 const rules=folderOrMode==='--production'
  ?prepareProductionAlerts(input,read('technical-alerts.json'),{metricsUID})
  :prepareAlerts(input,{folderUID:folderOrMode,metricsUID,logsUID});
 process.stdout.write(JSON.stringify(rules,null,2)+'\n');
}
