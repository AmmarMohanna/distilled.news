import fs from 'node:fs/promises';
import path from 'node:path';
const dir='.local-reports/demo-platform-20261021';
const settings=JSON.parse(await fs.readFile(dir+'/deployed-settings-before.json','utf8'));
const bindings=settings.bindings,vars={};
const toml=await fs.readFile('apps/worker/wrangler.sources-qa.toml','utf8');
for(const [,name,value] of toml.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/gm)){
 const v=value.trim();vars[name]=v.startsWith("'")?v.slice(1,-1):JSON.parse(v);
}
for(const name of ['SOURCE_PROVIDER_BUDGETS_JSON','SOURCE_OPERATION_CEILINGS_JSON','SOURCE_PER_PROVIDER_BUDGET_USD','CLOUDFLARE_IMAGE_ACCOUNT_ID']){const b=bindings.find(b=>b.name===name&&b.type==='plain_text');if(b)vars[name]=b.text;}
delete vars.STAGING_ASSETS_PREFIX;
const db=bindings.find(x=>x.name==='DB'),raw=bindings.find(x=>x.name==='RAW_ARCHIVE'),processing=bindings.find(x=>x.name==='PROCESSING_QUEUE'),web=bindings.find(x=>x.name==='WEB_OPERATOR_QUEUE');
if(db.id!=='f34f4399-1e3b-4d4f-ba17-564e54e9f941'||raw.bucket_name!=='distilled-news-qa-v3-raw')throw Error('QA_RESOURCE_MISMATCH');
const config={name:'distilled-news-sources-qa',account_id:'e32b564514d4f9b9e383b7dd30dbb026',main:'src/sources-qa.ts',compatibility_date:'2026-10-05',compatibility_flags:['nodejs_compat','global_fetch_strictly_public'],workers_dev:true,preview_urls:false,routes:[],vars,limits:{cpu_ms:300000},assets:{directory:'../web/dist',binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:true},d1_databases:[{binding:'DB',database_name:'distilled-news-qa-v3-fresh',database_id:db.id,migrations_dir:'migrations'}],r2_buckets:[{binding:'RAW_ARCHIVE',bucket_name:raw.bucket_name}],queues:{producers:[{binding:'PROCESSING_QUEUE',queue:processing.queue_name},{binding:'SOURCE_COLLECTION_QUEUE',queue:'distilled-news-sources-qa-collection'},{binding:'V1_PROCESSING_QUEUE',queue:'distilled-news-sources-qa-v1'},{binding:'V1_ACQUISITION_QUEUE',queue:'distilled-news-sources-qa-acquisition'},...(web?[{binding:'WEB_OPERATOR_QUEUE',queue:web.queue_name}]:[])],consumers:[{queue:processing.queue_name,max_batch_size:5,max_batch_timeout:1,max_retries:5,dead_letter_queue:'distilled-news-qa-v3-processing-dlq'},...['collection','v1','acquisition'].map(x=>({queue:'distilled-news-sources-qa-'+x,max_batch_size:1,max_batch_timeout:1,max_retries:5,...(x==='collection'?{max_concurrency:8}:{}),dead_letter_queue:'distilled-news-sources-qa-'+x+'-dlq'}))]},vpc_services:[{binding:'SOURCE_EXECUTION_SERVICE',service_id:'01a1099d-e88a-7c23-a1c5-eeb51471e780'}],triggers:{crons:['* * * * *']},observability:{enabled:true}};
const token=(await fs.readFile(path.join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
const r=await fetch('https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026/queues?per_page=100',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok||!data.success)throw Error('QUEUE_INSPECTION_FAILED');
const selected=data.result.filter(x=>config.queues.producers.some(p=>p.queue===x.queue_name)||x.queue_name.includes('sources-qa')||x.queue_name.includes('qa-v3'));
await fs.writeFile(dir+'/queues-before.json',JSON.stringify(selected,null,2));
const missing=config.queues.consumers.flatMap(c=>[c.queue,c.dead_letter_queue]).filter(name=>!data.result.some(x=>x.queue_name===name));
await fs.writeFile('apps/worker/wrangler.dataset-qa.jsonc',JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({config:'apps/worker/wrangler.dataset-qa.jsonc',database:db.id,bucket:raw.bucket_name,missingQueues:[...new Set(missing)],queueOwnership:selected.map(x=>({name:x.queue_name,id:x.queue_id,consumers:x.consumers?.map(c=>({script:c.script,script_name:c.script_name,type:c.type}))}))}));
