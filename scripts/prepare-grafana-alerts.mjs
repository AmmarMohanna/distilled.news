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
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(JSON.stringify(prepareAlerts(JSON.parse(readFileSync('ops/observability/grafana-alerts.json','utf8')),{folderUID:process.argv[2],metricsUID:process.argv[3],logsUID:process.argv[4]}),null,2)+'\n');
