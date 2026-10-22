import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

function percentiles(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 const at=p=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;
 return {samples:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99)};
}
/** Input is redacted structured records, including parsed Wrangler tail logs.
 * Receipt cost is deduplicated by durable operation ID, not by replay delivery. */
export function summarize(records){
 const phases=new Map(),queue={durations:[],waits:[],outcomes:new Map()},costs=new Map();
 for(const record of records){
  if(record?.type==='V1_QUEUE_LATENCY'){
   queue.durations.push(record.durationMs);queue.waits.push(record.queueWaitMs);
   const outcome=['SUCCEEDED','FEED_TURN_BUSY','TEMPORARY_UNAVAILABLE','SCOPE_DENIED','FAILED','INVALID_REQUEST','IDEMPOTENCY_CONFLICT'].includes(record.outcome)?record.outcome:'OTHER';
   queue.outcomes.set(outcome,(queue.outcomes.get(outcome)??0)+1);continue;
  }
  if(record?.type!=='V1_PIPELINE_LATENCY'||!['REVIEW','REMATCH','PUBLICATION','MODEL'].includes(record.phase))continue;
  if(!phases.has(record.phase))phases.set(record.phase,{durations:[],outcomes:new Map(),stages:new Map(),counts:new Map()});
  const phase=phases.get(record.phase);phase.durations.push(record.durationMs);
  const outcome=record.outcome==='SUCCEEDED'?'SUCCEEDED':'FAILED';phase.outcomes.set(outcome,(phase.outcomes.get(outcome)??0)+1);
  for(const [name,stage] of Object.entries(record.stages??{})){
   if(!/^[A-Z][A-Z0-9_]{0,80}$/.test(name)||!Number.isFinite(stage?.durationMs)||!Number.isFinite(stage.count))continue;
   if(!phase.stages.has(name))phase.stages.set(name,{durations:[],operations:0});
   const aggregate=phase.stages.get(name);aggregate.durations.push(stage.durationMs);aggregate.operations+=stage.count;
  }
  for(const [name,amount] of Object.entries(record.counts??{}))if(/^[a-zA-Z][a-zA-Z0-9]{0,80}$/.test(name)&&Number.isFinite(amount))phase.counts.set(name,(phase.counts.get(name)??0)+amount);
  const receiptId=record.receiptOperationId??record.operationId;
  if(record.phase==='MODEL'&&typeof receiptId==='string'&&record.counts?.reportedUsage===1&&Number.isFinite(record.counts.receiptReportedCostUsd))costs.set(receiptId,record.counts.receiptReportedCostUsd);
 }
 return {phases:Object.fromEntries([...phases].map(([name,p])=>[name,{durationMs:percentiles(p.durations),outcomes:Object.fromEntries(p.outcomes),counts:Object.fromEntries(p.counts),stages:Object.fromEntries([...p.stages].map(([s,v])=>[s,{durationMs:percentiles(v.durations),operations:v.operations}]))}])),queue:{durationMs:percentiles(queue.durations),waitMs:percentiles(queue.waits),outcomes:Object.fromEntries(queue.outcomes)},uniqueReportedModelOperations:costs.size,uniqueReportedModelCostUsd:[...costs.values()].reduce((a,b)=>a+b,0)};
}
export function recordsFromText(raw){
 const records=[];
 const inspect=value=>{
  if(Array.isArray(value)){value.forEach(inspect);return;}
  if(!value||typeof value!=='object')return;
  if(value.type==='V1_PIPELINE_LATENCY'||value.type==='V1_QUEUE_LATENCY')records.push(value);
  if(Array.isArray(value.logs))for(const entry of value.logs)for(const message of entry.message??[])if(typeof message==='string')try{inspect(JSON.parse(message))}catch{}
 };
 // Wrangler emits consecutive pretty-printed JSON objects, not necessarily JSONL.
 // Scan only complete containers, respecting escaped strings (including prompts
 // in legacy logs); inspect() still admits only our two numeric record types.
 let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(start<0){if(c==='{'||c==='['){start=i;depth=1;quoted=false;escaped=false}continue}
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
  if(c==='"'){quoted=true;continue}
  if(c==='{'||c==='[')depth++;
  else if(c==='}'||c===']')if(--depth===0){try{inspect(JSON.parse(raw.slice(start,i+1)))}catch{}start=-1}
 }
 return records;
}
export function decodeLog(buffer){
 return buffer[0]===0xff&&buffer[1]===0xfe?buffer.subarray(2).toString('utf16le'):buffer.toString('utf8').replace(/^\uFEFF/,'');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const files=process.argv.slice(2);if(!files.length)throw Error('Usage: node scripts/summarize-briefing-latency.mjs <redacted-log.jsonl> [...]');
 const records=(await Promise.all(files.map(async file=>decodeLog(await readFile(file))))).flatMap(recordsFromText);
 console.log(JSON.stringify(summarize(records),null,2));
}
