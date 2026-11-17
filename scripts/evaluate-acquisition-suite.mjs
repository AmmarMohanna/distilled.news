// Durable harness; run artifacts are intentionally local and ignored.
import {parseArgs} from 'node:util';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const {values}=parseArgs({options:{base:{type:'string'},owner:{type:'string'},prefix:{type:'string'},phase:{type:'string',default:'cheap'},sourceId:{type:'string'},fixtureBase:{type:'string'},replayMode:{type:'string',default:'both'}}});
for(const name of values.phase==='synthetic'?['prefix']:['base','owner','prefix'])if(!values[name])throw Error(`Missing --${name}`);
if(!/^[a-zA-Z0-9_-]{8,40}$/.test(values.prefix))throw Error('Invalid evaluation prefix');
if(!['cheap','baseline','hybrid','replay','synthetic'].includes(values.phase))throw Error('Invalid phase');
if(values.phase==='synthetic'){
  await mkdir('.local-reports',{recursive:true});
  const output=resolve(`.local-reports/${values.prefix}-authenticated-synthetic.json`);
  const code=await new Promise(done=>{const child=spawn(process.execPath,[resolve('apps/worker/node_modules/vitest/vitest.mjs'),'run','--config','vitest.config.ts','src/authenticated-x-acquisition.test.ts','src/acquisition-evaluation.test.ts','--maxWorkers=1'],{cwd:resolve('apps/worker'),stdio:'inherit',env:{...process.env,DISTILLED_EVALUATION_OUTPUT:output}});child.on('error',()=>done(1));child.on('exit',done)});
  if(code!==0)process.exitCode=1;
  else console.log(await readFile(output,'utf8'));
}else{
if(!['baseline','hybrid','both'].includes(values.replayMode))throw Error('Invalid replay mode');
const origin=new URL(values.base).origin,fixtureOrigin=values.fixtureBase?new URL(values.fixtureBase).origin:origin,root=`${fixtureOrigin}/v1/live-smoke/acquisition-fixture`;
const window={start:'2026-09-24T12:00:00Z',end:'2026-09-25T12:00:00Z'};
const cases=values.phase==='cheap'?[
  {name:'structured-boundaries',source:`${root}/rss`,evaluation:`${values.prefix}-rss`,maxItems:'10',...window},
  {name:'deterministic-http',source:`${root}/article`,evaluation:`${values.prefix}-http`,maxItems:'10',...window},
  {name:'access-denied',source:`${root}/denied`,evaluation:`${values.prefix}-denied`,maxItems:'10',...window},
  {name:'live-rss',source:'https://feeds.bbci.co.uk/news/world/rss.xml',maxItems:'30',start:new Date(Date.now()-86400000).toISOString(),end:new Date().toISOString()},
  {name:'aljazeera-active-partial',source:'https://www.aljazeera.net/',maxItems:'2',start:'2026-09-26T00:00:00Z',end:new Date().toISOString()}
]:values.phase==='replay'?['baseline','hybrid'].filter(mode=>values.replayMode==='both'||values.replayMode===mode).map(mode=>({name:`${mode}-replay`,source:`${fixtureOrigin}/v1/live-smoke/browser-use-fixture/listing/${values.prefix}-${mode}`,evaluation:`${values.prefix}-${mode}`,maxItems:'2',start:'2026-09-24T00:00:00Z',end:'2026-09-26T00:00:00Z'})):
[{name:`${values.phase}-first-encounter`,source:`${fixtureOrigin}/v1/live-smoke/browser-use-fixture/listing/${values.prefix}-${values.phase}`,evaluation:`${values.prefix}-${values.phase}`,maxItems:'2',start:'2026-09-24T00:00:00Z',end:'2026-09-26T00:00:00Z'}];
await mkdir('.local-reports',{recursive:true});
const matrix=[];
for(const entry of cases){
  const output=`.local-reports/${values.prefix}-${entry.name}.json`;
  const options={base:values.base,owner:values.owner,source:entry.source,start:entry.start,end:entry.end,key:`${values.prefix}-${entry.name}`,maxItems:entry.maxItems,maxExecutionMs:values.phase==='cheap'?'90000':'110000',output,...(entry.evaluation?{evaluation:entry.evaluation}:{}),...(values.sourceId?{sourceId:values.sourceId}:{})};
  const args=['scripts/evaluate-public-discovery.mjs',...Object.entries(options).flatMap(([key,value])=>[`--${key}`,value])];
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});child.on('error',()=>resolve(1));child.on('exit',resolve)});
  let report;try{report=JSON.parse(await readFile(output,'utf8'))}catch{matrix.push({name:entry.name,proof:'NOT_PROVEN',failure:'NO_DURABLE_ARTIFACT',exitCode:code});continue}
  const result=report.result??{},telemetry=report.telemetry??{};
  const checks=[];
  if(entry.name==='structured-boundaries')checks.push(result.status==='SUCCESS'&&result.items?.length===2&&result.coverage?.rangeCovered===true&&result.coverage?.truncated===false&&result.coverage?.stopReason==='START_BOUNDARY_REACHED'&&(result.items??[]).some(item=>Date.parse(item.publishedAt)===Date.parse(entry.start))&&!(result.items??[]).some(item=>Date.parse(item.publishedAt)===Date.parse(entry.end)));
  if(entry.name==='deterministic-http')checks.push(result.status==='SUCCESS'&&result.selectedStage==='HTTP'&&result.coverage?.rangeCovered===true&&result.coverage?.stopReason==='SOURCE_EXHAUSTED');
  if(entry.name==='access-denied')checks.push(result.status==='STOPPED'&&result.stopReason==='AUTH_REQUIRED'&&result.browserUseDiscoveryRuns===0&&!result.activeWorkflow&&!result.committedHighWater?.lastSuccessfulBoundary);
  if(values.phase==='baseline'||values.phase==='hybrid')checks.push(result.status==='SUCCESS'&&result.items?.length===2&&result.candidateWorkflow?.promoted===true&&result.browserUseDiscoveryRuns===1&&result.discoveryModelCalls>0);
  if(values.phase==='hybrid')checks.push(telemetry.decisionMode==='JEV_HYBRID'&&result.jevExecutedActions>0);
  if(values.phase==='replay')checks.push(result.status==='SUCCESS'&&result.items?.length===2&&!!result.activeWorkflow&&result.browserUseDiscoveryRuns===0&&result.discoveryModelCalls===0&&result.jevCalls===0);
  const acceptancePassed=checks.length?checks.every(Boolean):null;
  if(acceptancePassed===false)process.exitCode=1;
  matrix.push({name:entry.name,acceptancePassed,proof:'LIVE_PRODUCTION',source:entry.source,requestedWindow:result.requestedWindow,effectiveWindow:result.effectiveWindow,stage:result.selectedStage,status:result.status,items:result.items?.length??0,uniqueItems:new Set((result.items??[]).map(item=>item.sourceItemId??item.canonicalItemUrl)).size,coverage:result.coverage,highWaterBefore:result.highWaterBefore,highWaterAfter:result.committedHighWater,browserUseRuns:result.browserUseDiscoveryRuns,fullModelCalls:result.discoveryModelCalls,jevAttempts:result.jevCalls,successfulJevChoices:result.jevSuccessfulChoices,jevExecutedActions:result.jevExecutedActions,fallbacks:result.decisionFallbacks,discoveryBrowserOperations:result.discoveryBrowserOperations,agentActionCalls:telemetry.agentBrowserActions,runnerBrowserOperations:telemetry.browserOperations,traversalPhysicalAttempts:result.continuation?.physicalAttempts,elapsedMs:result.latencyMs,workflow:result.activeWorkflow,learned:result.candidateWorkflow?.promoted??false,itemHandoff:result.itemHandoff,reportedJevCostUsd:result.jevCostUsd,requestId:report.requestId,exitCode:code});
}
await writeFile(`.local-reports/${values.prefix}-${values.phase}-matrix.json`,JSON.stringify({schema:'distilled.acquisition.matrix.v1',phase:values.phase,rows:matrix,limitations:['Authenticated timeline proof is the package integration fixture, not live X.','Use paired fresh prefix-baseline/prefix-hybrid deployments with identical configuration except decision mode.','Provider-reported Jev cost is not total generative acquisition cost.']},null,2));
console.log(JSON.stringify(matrix,null,2));
}
