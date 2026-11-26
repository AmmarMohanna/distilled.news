import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';import {spawn} from 'node:child_process';
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';
const dir='.local-reports/real-campaigns/pilotnov02';
const {CAMPAIGN_ADMIN_COOKIE,CAMPAIGN_CLOUDFLARE_TOKEN,CAMPAIGN_GRAFANA_OTLP_URL,CAMPAIGN_GRAFANA_AUTH}=process.env;
if(!CAMPAIGN_ADMIN_COOKIE||!CAMPAIGN_CLOUDFLARE_TOKEN||!CAMPAIGN_GRAFANA_OTLP_URL||!CAMPAIGN_GRAFANA_AUTH)throw Error('PILOT_RUNTIME_CREDENTIALS_REQUIRED');
const workerName=process.env.CAMPAIGN_PILOT_WORKER;
if(!/^distilled-news-staging-campaign-[a-z0-9-]+$/.test(workerName??''))throw Error('ISOLATED_PILOT_WORKER_REQUIRED');
const accountPath=new URL(QUALITY_EVALUATION_D1).pathname.split('/d1/')[0];
const manifest=JSON.parse(readFileSync(dir+'/manifest.private.json','utf8'));
const origin=new URL(manifest.origin);
if(origin.protocol!=='https:'||!origin.hostname.startsWith(workerName+'.')||!origin.hostname.endsWith('.workers.dev'))throw Error('PILOT_WORKER_MANIFEST_MISMATCH');
const env={...process.env,CAMPAIGN_ADAPTER:fileURLToPath(new URL('./pilot-native-adapter.mjs',import.meta.url)),K6_NO_USAGE_REPORT:'true',K6_AUTO_EXTENSION_RESOLUTION:'false'};
const base='https://api.cloudflare.com'+accountPath+'/workers/scripts/'+workerName;
async function cron(enabled){const r=await fetch(base+'/schedules',{method:'PUT',headers:{authorization:'Bearer '+CAMPAIGN_CLOUDFLARE_TOKEN,'content-type':'application/json'},body:JSON.stringify(enabled?[{cron:'* * * * *'}]:[]),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('ISOLATED_CRON_'+r.status);appendFileSync(dir+'/journal.jsonl',JSON.stringify({at:new Date().toISOString(),category:'isolated-cron',enabled})+'\n');}
async function run(phase){await new Promise((done,reject)=>{const child=spawn(process.execPath,['evaluation/performance-reliability/real/run.mjs',phase,dir+'/manifest.private.json',dir+'/preflight.private.json',dir+'/approval.private.json'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';for(const s of [child.stdout,child.stderr])s.on('data',b=>{output+=b.toString();if(output.length>20000)output=output.slice(-20000)});child.on('exit',code=>{writeFileSync(dir+'/'+phase+'-execution.private.log',output);if(code===0)done();else reject(Error('PILOT_'+phase.toUpperCase()+'_FAILED_'+code))});child.on('error',reject)})}
let started=false;try{await run('plan');await cron(true);started=true;console.log(JSON.stringify({at:new Date().toISOString(),pilot:'RUNNING',users:2,feeds:4,observeSeconds:5400,maximumTrafficRequests:120}));await run('campaign');await run('report');console.log(JSON.stringify({pilot:'COMPLETE_REPORT_REQUIRES_REVIEW'}));}finally{if(started)await cron(false);}
