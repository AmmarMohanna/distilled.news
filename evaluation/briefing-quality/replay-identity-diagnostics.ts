/** Offline only. Requires retained production artifacts, never credentials or inference.
 * pnpm exec tsx evaluation/briefing-quality/replay-identity-diagnostics.ts <artifact-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inventory,metrics,type Case} from './worker/src/protocol';
import {parseGrounding,groundedInventory,groundedReview} from './worker/src/grounding';
import {auditLegacyArabicClaimInventory as auditClaimInventory} from './worker/src/claim-inventory';
import {arabicIdentityIssues} from '../../packages/briefing/src/identity-fidelity';
const dir=process.argv[2];if(!dir)throw Error('Expected retained artifact directory');
const hashes:Record<string,string>={};
function read(file:string){const bytes=fs.readFileSync(path.join(dir,file));hashes[file]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes.toString('utf8'))}
const manifest=read('eval-artifacts.json'),replays=[];
for(const job of manifest.jobs){
 const c=read('snapshot-'+job.id+'.json') as Case;
 const raw=(stage:string)=>{const call=manifest.calls.find((x:{job_id:string;stage:string})=>x.job_id===job.id&&x.stage===stage);if(!call||call.state!=='SETTLED')throw Error('Missing settled original response');const response=read('response-'+call.id+'.json');return JSON.parse(response.choices[0].message.content)};
 const proposed=inventory(raw('independent_developments'),c),d=groundedInventory(proposed,parseGrounding(raw('inventory_grounding_v1'),proposed));
 let outcome='accepted',audit,replayedMetrics;
 try{const r=groundedReview(raw('atomic_claims_and_coverage'),c,d);audit=auditClaimInventory(c,r);replayedMetrics=metrics(r,d,c)}catch(error){outcome=(error as Error).message}
 replays.push({job:job.id,original:job.error??'accepted',replayed:outcome,audit,replayedMetrics});
 if(outcome!==(job.error??'accepted'))throw Error('Original outcome changed');
}
const windows=[];
for(const id of ['827b1694b5fea1a0b59da150d9b393de317faaab24e84fdb7af426e4b4a5bb1d','72bf6cacbbf523fa73528cf2d6f62aa71f6d7ac2641abe2eec634b2f0526236e']){
 const input=read('v3_window_inputs-'+id+'.json'),saved=read('v3_window_results-'+id+'.json');
 const issues=saved.result.items.flatMap((item:{headline:string;body:string;sourceIds:string[]},index:number)=>arabicIdentityIssues(item.headline+'\n'+item.body,input.input.articles.filter((a:{id:string})=>item.sourceIds.includes(a.id)).map((a:{text:string})=>a.text)).map(issue=>({item:index,...issue})));
 const stages=saved.operationIds.map((op:string)=>{const result=read('semantic_results-'+op+'.json');return {operationId:op,createdAt:result.createdAt,systemPrefix:result.input.state.request.system.slice(0,65),response:JSON.parse(result.value.text),costUsd:result.value.costUsd}});
 windows.push({id,windowEnd:input.input.windowEnd,issues,stages});
}
const output=JSON.stringify({policy:'production-identity-offline-diagnostic-v1',newInferenceCostUsd:0,fullOriginalReplay:true,replays,windows,originalEvalCalls:manifest.calls.length,originalEvalCostUsd:manifest.calls.reduce((n:number,c:{cost_micro:number})=>n+c.cost_micro,0)/1e6,hashes},null,2);
if(process.argv[3])fs.writeFileSync(process.argv[3],output);else console.log(output);
