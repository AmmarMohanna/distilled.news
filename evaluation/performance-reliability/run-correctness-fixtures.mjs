import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {percentileR7} from './metrics.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const group=process.argv[2];
const suites={
  browser:['src/browser-use-fixture.test.ts','src/browser-use-run-telemetry.test.ts','src/agent-runtime-recovery.integration.test.ts'],
  v3:['src/v1-intelligence/v3-window.test.ts','src/v1-queue-dispatch.test.ts'],
  accounts:['src/app.test.ts'],
};
if(!Object.hasOwn(suites,group))throw Error('EXPLICIT_OFFLINE_FIXTURE_GROUP_REQUIRED');
const dir=resolve(root,'.local-reports/agentops-fixtures',group);mkdirSync(dir,{recursive:true});
const output=resolve(dir,'vitest.json'),started=Date.now();
// No account credentials are loaded; tests use scripted models and local databases/browser fixtures.
const env={...process.env,OPENROUTER_API_KEY:'',APIFY_API_TOKEN:'',TWITTERAPI_IO_API_KEY:'',GRAFANA_INGEST_TOKEN:'',CLOUDFLARE_API_TOKEN:'',WRANGLER_SEND_METRICS:'false'};
const child=spawn(process.execPath,[resolve(root,'apps/worker/node_modules/vitest/vitest.mjs'),'run',...suites[group],'--reporter=json','--outputFile='+output],{cwd:resolve(root,'apps/worker'),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let text='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{if(text.length<2000000)text+=b.toString();});
const timer=setTimeout(()=>child.kill('SIGTERM'),900000);
let code;try{code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});}finally{clearTimeout(timer);}
writeFileSync(resolve(dir,'fixture.log'),text);
let results;try{results=JSON.parse(readFileSync(output,'utf8'));}catch{throw Error('FIXTURE_RESULT_MISSING');}
const assertions=results.testResults.flatMap(s=>s.assertionResults),durations=assertions.filter(a=>a.status==='passed'&&Number.isFinite(a.duration)).map(a=>a.duration);
const elapsed=Date.now()-started,report={schemaVersion:'distilled-correctness-fixture.v1',group,mode:'OFFLINE_CONTRACT',startedAt:new Date(started).toISOString(),elapsedMs:elapsed,exitCode:code,passed:assertions.filter(a=>a.status==='passed').length,failed:assertions.filter(a=>a.status==='failed').length,skipped:assertions.filter(a=>a.status==='pending'||a.status==='skipped').length,
  assertionRuntimeMs:{samples:durations.length,p50:percentileR7(durations,.5),p95:percentileR7(durations,.95),p99:percentileR7(durations,.99)},
  limitations:['Percentiles describe assertion runtimes, not real model, tool, browser or publication latency.','Scripted failure/recovery correctness is separate from k6 HTTP throughput.','No staging account, source, provider or notification operation is authorized by this harness.','A real controlled V3/browser performance campaign still requires an approved workload and measurements.']};
writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2));
writeFileSync(resolve(dir,'report.html'),'<!doctype html><meta charset="utf-8"><title>Offline correctness fixtures</title><h1>Offline correctness fixtures</h1><pre>'+JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;')+'</pre>');
console.log(JSON.stringify(report));if(code!==0||report.failed||!report.passed)process.exitCode=1;
