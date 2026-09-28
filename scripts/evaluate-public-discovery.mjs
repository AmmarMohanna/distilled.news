// Bounded, read-only production evaluation. Credentials are loaded only at runtime.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseArgs} from 'node:util';
const {values}=parseArgs({options:{base:{type:'string'},owner:{type:'string'},source:{type:'string'},start:{type:'string'},end:{type:'string'},key:{type:'string'},evaluation:{type:'string'},output:{type:'string'}}});
for(const name of ['base','owner','source','start','end','key'])if(!values[name])throw Error(`Missing --${name}`);
const base=new URL(values.base);if(base.protocol!=='https:')throw Error('HTTPS required');
if(!process.env.DISTILLED_RUNTIME_TOKEN_FILE)throw Error('Set DISTILLED_RUNTIME_TOKEN_FILE');
const token=(await readFile(process.env.DISTILLED_RUNTIME_TOKEN_FILE,'utf8')).trim();
const prefix=values.evaluation?'/v1/live-smoke/public-acquisition':'/v1/sources/acquisition';
async function call(path,body){
  const response=await fetch(new URL(path,base),{method:body?'POST':'GET',redirect:'error',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Evaluation HTTP ${response.status}`);
  return response.json();
}
const submitted=await call(`${prefix}/submit`,{ownerAccountId:values.owner,sourceUrl:values.source,startTime:values.start,endTime:values.end,idempotencyKey:values.key,...(values.evaluation?{evaluationId:values.evaluation}:{}),limits:{maxItems:2,maxPages:3,maxScrolls:3,maxPhysicalAttempts:16,maxExecutionMs:90000}});
console.log(JSON.stringify({requestId:submitted.requestId,state:submitted.state}));
let report;
for(let attempts=0;attempts<90;attempts++){
  report=await call(`${prefix}/requests/${submitted.requestId}`);
  if(['completed','failed'].includes(report.state))break;
  await new Promise(resolve=>setTimeout(resolve,10000));
}
const telemetry=report.result?.webOperatorRunId?await call(`/v1/browser-use-runs/${report.result.webOperatorRunId}`):null;
// No request payload, credentials, provider responses or browser transcripts in artifact.
const artifact={schema:'distilled.acquisition.evaluation.v1',proof:'LIVE_PRODUCTION',observedAt:new Date().toISOString(),...report,telemetry};
await mkdir('.local-reports',{recursive:true});
await writeFile(values.output??`.local-reports/${submitted.requestId}.json`,JSON.stringify(artifact,null,2));
console.log(JSON.stringify(artifact));
if(report.state!=='completed'||report.result?.status!=='SUCCESS')process.exitCode=1;
