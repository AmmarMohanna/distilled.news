import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const phase=process.argv[2];if(!['before','after'].includes(phase))throw Error('Choose before or after');
const dir='.local-reports/provider-capacity-recovery-20261111/';mkdirSync(dir,{recursive:true});
if(phase==='before'&&existsSync(dir+'before.private.json'))throw Error('Baseline already exists');
const ids=['unread-summary-provider:2492ea20d58bb5d620299d6ca266e66eb63ebaef5c2784edf8b0b3f0f8589c1a','semantic_intents:8257b6f96d0e187b1fe0cd73aa420253677c856266aca0f34f16ff9c34f4be30','semantic_intents:0c61b7f4c4d20c5b78ad32f1a42f3a63e4943061b9568e2aa8f931b752ee85a1'];
const inIds=ids.map(id=>"'"+id+"'").join(',');
const query=sql=>JSON.parse(execFileSync(process.execPath,['apps/worker/node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--remote','--config','apps/worker/wrangler.staging.toml','--json','--command',sql],{encoding:'utf8',timeout:45000,maxBuffer:5_000_000}));
const money=query(`SELECT * FROM v1_model_spending_reservations WHERE id IN (${inIds}) ORDER BY id; SELECT * FROM v1_model_spending_settlements WHERE id IN (${inIds}) ORDER BY id`).map(x=>x.results);
const state=query(`SELECT id,json_extract(json,'$.window.scheduledFor') AS scheduledFor,json_extract(json,'$.state') AS state,json_extract(json,'$.reason') AS reason,json_extract(json,'$.result') AS result,json_extract(json,'$.completedAt') AS completedAt FROM v1_feed_documents WHERE kind='briefing_requests' AND feed_id='briefing_68867e36-7d4f-42ac-af76-fa29dd9cbbad' LIMIT 20; SELECT id,json_extract(json,'$.policy') AS policy,json_extract(json,'$.financialExposureRetained') AS financialExposureRetained FROM v1_feed_documents WHERE kind='model_execution_quarantines' AND id IN (${inIds})`);
const response=await fetch('https://distilled-news-staging.distillednews-platform.workers.dev/api/feed/product-proof/lebanon-2');if(!response.ok)throw Error('Public feed HTTP '+response.status);
const feed=await response.json();
const publicEditions=(feed.editions??[]).map(e=>({id:e.id,publishedAt:e.publishedAt,windowStart:e.windowStart,windowEnd:e.windowEnd,storyCount:e.stories?.length??e.sections?.length}));
const data={at:new Date().toISOString(),money,state,publicEditions};
if(phase==='after'){
 const before=JSON.parse(readFileSync(dir+'before.private.json','utf8'));
 data.originalFinancialRecordsUnchanged=JSON.stringify(before.money)===JSON.stringify(money);
 data.capacity=query("SELECT provider,feed_id,COUNT(*) AS active FROM v1_model_active_operations GROUP BY provider,feed_id; SELECT COUNT(*) AS n FROM v1_model_spending_reservations WHERE (CASE WHEN model LIKE 'cloudflare:%' OR model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END)='openrouter' AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'); EXPLAIN QUERY PLAN SELECT COUNT(*) FROM v1_model_active_operations WHERE provider='openrouter'; EXPLAIN QUERY PLAN SELECT COUNT(*) FROM v1_model_spending_reservations WHERE (CASE WHEN model LIKE 'cloudflare:%' OR model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END)='openrouter' AND created_at>='2026-11-11T18:00:00Z'");
}
writeFileSync(dir+phase+'.private.json',JSON.stringify(data,null,2));
console.log(JSON.stringify({...data,money:undefined,state:state.map(x=>({results:x.results,rowsRead:x.meta?.rows_read})),capacity:data.capacity?.map(x=>({results:x.results,rowsRead:x.meta?.rows_read}))},null,2));
