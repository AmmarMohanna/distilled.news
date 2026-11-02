/** Uses ONLY tokens generated for this evaluator, not existing account credentials. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const secrets=JSON.parse(fs.readFileSync(path.join(root,'../private/evaluator-access.json'),'utf8'));
const origin='https://distilled-briefing-quality.distillednews-platform.workers.dev';
async function call(url,token,method='GET') {const response=await fetch(origin+url,{method,redirect:'manual',headers:token?{authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});return response}
const unauthorized=await call('/api/summary');if(unauthorized.status!==401)throw Error('PRIVATE_API_NOT_PROTECTED');
const wrongScope=await call('/metrics',secrets.DASHBOARD_TOKEN);if(wrongScope.status!==401)throw Error('METRICS_TOKEN_NOT_SEPARATE');
const page=await call('/');if(!page.ok)throw Error('DASHBOARD_UNAVAILABLE');
let summary;
if(process.argv.includes('--collect')){const response=await call('/api/discover',secrets.DASHBOARD_TOKEN,'POST');if(!response.ok)throw Error('COLLECTION_FAILED:'+response.status);summary=await response.json()}
else {const response=await call('/api/summary',secrets.DASHBOARD_TOKEN);if(!response.ok)throw Error('SUMMARY_UNAVAILABLE');summary=await response.json()}
const metricResponse=await call('/metrics',secrets.METRICS_TOKEN);if(!metricResponse.ok)throw Error('METRICS_UNAVAILABLE');const metrics=await metricResponse.text();
if(!metrics.includes('distilled_eval_reviewed'))throw Error('METRICS_MISSING');
const record={checkedAt:new Date().toISOString(),privateApiStatus:unauthorized.status,separateMetricsScope:wrongScope.status,dashboardStatus:page.status,source:summary.source,enabled:summary.enabled,dailyBudgetUsd:summary.dailyBudgetUsd,eligible:summary.eligible,reviewed:summary.reviewed,groups:summary.groups,discovery:summary.discovery,lastTick:summary.lastTick,grafana:summary.grafana};
fs.writeFileSync(path.join(root,'../private/evaluator-live-smoke.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));
