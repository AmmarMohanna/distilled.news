import {readFileSync,writeFileSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {validateCloudflareLog} from '../apps/worker/src/cloudflare-log';
import {confirmedEvaluationCharge} from './cloudflare-evaluation-billing';
const load=(p:string)=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function durable(path:string,value:unknown){writeFileSync(path,JSON.stringify(value,null,2));const fd=openSync(path,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
async function readCloudflareChargeOnce(prefix:string,token:string|(()=>Promise<string>),priorRows:any[],reservationUsd:number,deadline:number){
 const saved=load(prefix+'-response.json'),payload=JSON.parse(saved.raw),logId=saved.headers['cf-aig-log-id'],base='https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026';
 const get=async(path:string)=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('BILLING_OBSERVATION_DEADLINE');const r=await fetch(base+path,{headers:{authorization:'Bearer '+(typeof token==='function'?await token():token)},signal:AbortSignal.timeout(Math.min(15000,remaining))});if(!r.ok)throw Error('BILLING_READ_UNAVAILABLE');const body=await r.json() as any;if(body.success!==true)throw Error('BILLING_READ_UNAVAILABLE');return body};
 const log=await get('/ai-gateway/gateways/default/logs/'+logId),route=validateCloudflareLog(log.result,logId,'cloudflare:openai/gpt-4.1',payload);
 const start=Math.floor(Date.parse(log.result.created_at)/3600000)*3600000,end=start+3600000;
 const billing=await get('/ai-gateway/billing/usage-history?value_grouping_window=hour&start_time='+start+'&end_time='+end),inventory=await get('/ai-gateway/gateways/default/logs?page=1&per_page=50'),terminal=await get('/ai-gateway/gateways/default/logs?page=2&per_page=50'),gateways=await get('/ai-gateway/gateways');
 if(billing.result.history.some((h:any)=>h.start_time*1000!==start||h.end_time*1000!==end))throw Error('BILLING_WINDOW_UNBOUND');
 const prior=priorRows.filter(r=>r.route==='cloudflare').map(r=>{if(!r.settled||!r.gatewayLogId)throw Error('PRIOR_CLOUDFLARE_CHARGE_UNCONFIRMED');const retained=inventory.result.find((l:any)=>l.id===r.gatewayLogId),bucketStartMs=Math.floor(Date.parse(retained?.created_at)/3600000)*3600000;return {id:r.gatewayLogId,costUsd:r.costUsd,bucketStartMs}});
 const proof={billing,inventory,inventoryComplete:Array.isArray(terminal.result)&&terminal.result.length===0,gatewayIds:gateways.result.map((g:any)=>g.id),current:{id:logId,estimatedCostUsd:route.estimatedCostUsd!,reservationUsd,bucketStartMs:start},prior};durable(prefix+'-billing-observation.json',proof);const costUsd=confirmedEvaluationCharge(proof);
 durable(prefix+'-billing-proof.json',{at:new Date().toISOString(),...proof,costUsd,log,source:'ACTUAL_BILLING_DELTA_WITH_EXACT_COMPLETE_GATEWAY_INVENTORY'});return {costUsd,gatewayLogId:logId};
}
export async function confirmCloudflareCharge(prefix:string,token:string|(()=>Promise<string>),priorRows:any[],reservationUsd:number){
 const deadline=Date.now()+240000;for(let attempt=0;;attempt++){if(Date.now()>=deadline)throw Error('BILLING_OBSERVATION_DEADLINE');try{return await readCloudflareChargeOnce(prefix,token,priorRows,reservationUsd,deadline)}catch(e){if(!(e instanceof Error)||e.message!=='BILLING_DELTA_UNCONFIRMED'||attempt>=16||Date.now()+15000>=deadline)throw e;await new Promise(resolve=>setTimeout(resolve,15000))}}
}
