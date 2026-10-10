import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Read-only, bounded measurements. Never enrolls sources, starts a provider
// operation or changes budgets. Reservations are ceilings, not invoices.
const root=fileURLToPath(new URL('../',import.meta.url)),worker=path.join(root,'apps/worker');
const config=await readFile(path.join(worker,'wrangler.sources-qa.toml'),'utf8');
if(!config.includes('database_name = "distilled-news-sources-qa"'))throw new Error('UNEXPECTED_QA_DATABASE');
const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:Number(process.argv[i+1]);};
const samples=arg('--samples',1),interval=arg('--interval-ms',60000);
if(!Number.isInteger(samples)||samples<1||samples>60||!Number.isInteger(interval)||interval<1000||interval>60000)throw new Error('INVALID_MEASUREMENT_BOUNDS');
const sql=`
 SELECT COUNT(*) AS sources, SUM(enabled) AS enabled_sources, COUNT(DISTINCT briefing_id) AS feeds FROM sources;
 SELECT s.feed_id,COUNT(*) AS receipts,SUM(length(r.json)) AS receipt_json_bytes,COUNT(DISTINCT r.item_key) AS distinct_item_keys FROM v1_intake_receipts r JOIN v1_intake_scopes s ON s.id=r.feed_source_id GROUP BY s.feed_id;
 SELECT provider_id,limit_usd,reserved_usd FROM connector_provider_budgets ORDER BY provider_id;
 SELECT provider_id,COUNT(*) AS operations,SUM(ceiling_usd) AS reservation_ceiling_usd,SUM(CASE WHEN payload_ref IS NULL THEN 1 ELSE 0 END) AS outcomes_without_saved_payload FROM connector_provider_operations GROUP BY provider_id;
 SELECT 'provider' AS scheduler,state,COUNT(*) AS jobs FROM connector_provider_poll_jobs GROUP BY state UNION ALL SELECT 'rss',state,COUNT(*) FROM connector_rss_poll_jobs GROUP BY state;
 SELECT feed_id,COUNT(*) AS saved_batches,AVG(json_extract(data,'$.telemetry.latencyMs')) AS mean_reported_latency_ms,SUM(json_extract(data,'$.telemetry.requests')) AS reported_requests,SUM(json_extract(data,'$.telemetry.providerCostUsd')) AS reported_cost_usd FROM connector_provider_batches GROUP BY feed_id;
 SELECT COUNT(*) AS candidates FROM v1_candidates;
 SELECT COUNT(*) AS editions FROM v1_feed_documents WHERE kind='editions';`;
async function snapshot(){const started=Date.now();const output=await new Promise((resolve,reject)=>{
 let out='',err='';const p=spawn(process.execPath,[path.join(worker,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB','--remote','--config','wrangler.sources-qa.toml','--command',sql,'--json'],{cwd:worker,windowsHide:true});
 p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.once('error',reject);p.once('exit',c=>c===0?resolve(out):reject(new Error('QA_METRICS_QUERY_FAILED: '+err.slice(0,500))));
});const rows=JSON.parse(output);if(rows.some(r=>!r.success))throw new Error('QA_METRICS_QUERY_FAILED');return {at:new Date().toISOString(),queryWallMs:Date.now()-started,results:rows.map(r=>r.results),databaseBytes:rows.at(-1)?.meta?.size_after};}
const report={environment:'distilled-news-sources-qa',spendBasis:'Reserved ceilings and provider-reported costs; no invoice verification',snapshots:[]};
await mkdir(path.join(root,'.review-tmp'),{recursive:true});
for(let i=0;i<samples;i++){
 const value=await snapshot();report.snapshots.push(value);
 await writeFile(path.join(root,'.review-tmp/qa-operation-metrics.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({at:value.at,sample:i+1,...value.results[0][0],databaseBytes:value.databaseBytes,queryWallMs:value.queryWallMs}));
 if(i+1<samples)await new Promise(resolve=>setTimeout(resolve,interval));
}
