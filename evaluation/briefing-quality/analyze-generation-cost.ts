/** Offline only: receipts for one successful execution, including exact historical reuse.
 * node packages/briefing/node_modules/tsx/dist/cli.mjs evaluation/briefing-quality/analyze-generation-cost.ts RUN_DIR CASE_ID
 * No provider access, secrets, writes or model inference. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {bindingReviewUser,COMPACT_READER_CONTEXT} from '../../packages/briefing/src/source-bound-claims';

export function analyzeGenerationCost(runDir:string,caseId:string){
if(!runDir||!caseId)throw Error('Usage: analyze-generation-cost.ts RUN_DIR CASE_ID');
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(runDir,name),'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const outcome=read(caseId+'.engine.outcome.json');
if(outcome.caseId!==caseId||outcome.system!=='engine'||outcome.error||!['published','quiet'].includes(outcome.engineResult?.status))throw Error('A matching successful engine outcome is required');
const ledgerText=fs.readFileSync(path.join(runDir,'ledger.jsonl'),'utf8');
const ledger=ledgerText.trim().split('\n').map(line=>JSON.parse(line));
const historical=read('historical-writers.json');
function stage(system:string){
 if(system.startsWith('You are the editor of'))return 'editor';
 if(system.startsWith('You are the senior editor merging'))return 'consolidation';
 if(system.startsWith('You assess whether a news item'))return 'novelty';
 if(system.startsWith('Independently identify'))return 'reader_inventory';
 if(system.startsWith('Independently extract'))return 'source_identity';
 if(system.startsWith('You are a meticulous source-grounded verifier.'))return 'verification';
 throw Error('Unclassified stage; inspect locally before reporting a total');
}
const operations=ledger.filter(r=>r.caseId===caseId&&r.system==='engine'&&['RESERVED','HISTORICAL_REUSE','REUSED'].includes(r.state)).map(row=>{
 let request,costUsd:number;
 if(row.state==='HISTORICAL_REUSE'){
  const old=historical.find((r:any)=>r.id===row.originalId);
  if(!old||old.originalUsage.costUsd!==row.originalReportedCostUsd)throw Error('Historical receipt mismatch');
  request=old.request;costUsd=row.originalReportedCostUsd;
  if(hash(request)!==row.requestHash)throw Error('Historical request mismatch');
 }else if(row.state==='RESERVED'){
  const receipt=ledger.find(r=>r.state==='SETTLED'&&r.id===row.id);
  if(!receipt)throw Error('Unsettled operation: this is not a completed execution');
  request=read(row.id+'.request.json');const response=read(row.id+'.response.json');
  if(response.id!==receipt.generationId||response.usage.cost!==receipt.costUsd||hash(request)!==row.hash)throw Error('Paid receipt mismatch');
  costUsd=receipt.costUsd;
 }else throw Error('Local reuse needs explicit receipt resolution before inclusion');
 const kind=stage(request.system),payload=kind==='verification'?JSON.parse(request.user):null,schema=JSON.stringify(request.responseSchema??null);
 const compactUser=kind==='verification'?bindingReviewUser(payload,'reader-unit-context-v1'):request.user;
 const oldInput=request.system+request.user+schema,newInput=request.system+(kind==='verification'?COMPACT_READER_CONTEXT:'')+compactUser+schema;
 return {stage:kind,requestHash:hash(request),costUsd,reused:row.state==='HISTORICAL_REUSE',
  originalInputCharacters:oldInput.length,compactInputCharacters:newInput.length,
  originalInputBytes:Buffer.byteLength(oldInput),compactInputBytes:Buffer.byteLength(newInput),
  ...(kind==='verification'?{facets:payload.inventory.length,originalUserCharacters:request.user.length,compactUserCharacters:compactUser.length,
   evidenceUnchanged:JSON.stringify({...JSON.parse(compactUser),inventory:payload.inventory})===request.user}:{}),
 };
});
if(!operations.length||new Set(operations.map(r=>r.requestHash)).size!==operations.length)throw Error('Missing or duplicate execution operations');
const stages=Object.fromEntries([...new Set(operations.map(r=>r.stage))].map(name=>[name,{calls:operations.filter(r=>r.stage===name).length,costUsd:operations.filter(r=>r.stage===name).reduce((s,r)=>s+r.costUsd,0)}]));
return {caseId,ledgerHash:hash(ledgerText),outcomeHash:hash(outcome),successfulExecutionOnly:true,stages,operations,
 originalExecutionReceiptCostUsd:operations.reduce((s,r)=>s+r.costUsd,0),
 originalInputCharacters:operations.reduce((s,r)=>s+r.originalInputCharacters,0),compactInputCharacters:operations.reduce((s,r)=>s+r.compactInputCharacters,0),
 excludes:['collection','separate evaluator','infrastructure','discarded earlier attempts','unknown operations outside this successful execution'],
 interpretation:'Historical stage receipts, not fresh production cost. Compact size is measured offline; token billing, model behavior and cold latency savings are not measured. No paid calls were made.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [runDir,caseId]=process.argv.slice(2);
 console.log(JSON.stringify(analyzeGenerationCost(runDir,caseId),null,2));
}
