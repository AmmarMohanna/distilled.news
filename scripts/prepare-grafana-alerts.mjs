import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
/** Convert file-provisioning format to HTTP API bodies; no network or credentials. */
export function prepareAlerts(document,{folderUID,metricsUID,logsUID}){
 for(const uid of [folderUID,metricsUID,logsUID])if(typeof uid!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(uid))throw Error('EXPLICIT_DATASOURCE_AND_FOLDER_UIDS_REQUIRED');
 return document.groups.flatMap(group=>group.rules.map(rule=>({...rule,orgID:group.orgId,folderUID,ruleGroup:group.name,data:rule.data.map(query=>({...query,datasourceUid:query.datasourceUid==='distilled-metrics'?metricsUID:query.datasourceUid==='distilled-logs'?logsUID:query.datasourceUid,model:{...query.model,datasource:{uid:query.datasourceUid==='distilled-metrics'?metricsUID:query.datasourceUid==='distilled-logs'?logsUID:'__expr__',type:query.datasourceUid==='distilled-metrics'?'prometheus':query.datasourceUid==='distilled-logs'?'loki':'__expr__'}}}))})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.stdout.write(JSON.stringify(prepareAlerts(JSON.parse(readFileSync('ops/observability/grafana-alerts.json','utf8')),{folderUID:process.argv[2],metricsUID:process.argv[3],logsUID:process.argv[4]}),null,2)+'\n');
