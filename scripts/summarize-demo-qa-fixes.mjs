import fs from 'node:fs/promises';
const dir=process.env.DATASET_FIXES_REPORT_DIR??'.local-reports/demo-platform-fixes-20261021';
const report=JSON.parse(await fs.readFile(dir+'/retest.json','utf8'));
const files=(await fs.readdir(dir)).filter(f=>/^snapshot-\d+\.json$/.test(f)).sort();
const snapshots=await Promise.all(files.map(f=>fs.readFile(dir+'/'+f,'utf8').then(JSON.parse)));
const first=snapshots[0],last=snapshots.at(-1);
const sum=(rows,predicate,field='n')=>rows.filter(predicate).reduce((n,r)=>n+Number(r[field]??1),0);
const percentile=(values,p)=>{const v=values.toSorted((a,b)=>a-b);return v.length?v[Math.min(v.length-1,Math.ceil(v.length*p)-1)]:null;};
const latency=path=>{const rows=report.requests.filter(r=>r.at>=report.activatedAt&&r.method==='GET'&&r.path.startsWith(path));return {samples:rows.length,medianMs:percentile(rows.map(r=>r.durationMs),.5),p95Ms:percentile(rows.map(r=>r.durationMs),.95),errors:rows.filter(r=>r.status!==200).length};};
const job=(s,kind,state)=>sum(s.jobs,j=>j.kind===kind&&j.state===state);
const sourceStats=s=>({feedsStarted:new Set(s.sources.filter(x=>x.first_fetch_started_at).map(x=>x.briefing_id)).size,sourcesStarted:s.sources.filter(x=>x.first_fetch_started_at).length});
const summary={startedAt:report.activatedAt,finishedAt:report.finishedAt,measurementEnd:last.at,verifiedPaused:report.verifiedPaused,before:sourceStats(first),after:sourceStats(last),acceptedBefore:sum(first.receipts,r=>r.decision==='ACCEPTED'),acceptedAfter:sum(last.receipts,r=>r.decision==='ACCEPTED'),jobsBefore:Object.fromEntries(['ACQUIRE','REASSESS'].flatMap(k=>['DONE','PENDING','RUNNING','FAILED'].map(s=>[k+':'+s,job(first,k,s)]))),jobsAfter:Object.fromEntries(['ACQUIRE','REASSESS'].flatMap(k=>['DONE','PENDING','RUNNING','FAILED'].map(s=>[k+':'+s,job(last,k,s)]))),reader:latency('/api/feed/'),providerOperationsBefore:first.providerOperations,providerOperationsAfter:last.providerOperations,modelGrants:last.modelGrants,published:report.snapshots.at(-1)?.feeds.filter(f=>f.editions).length??0};
try{
 const text=await fs.readFile(dir+'/worker-tail.jsonl','utf8'),events=[];let start=-1,depth=0,quoted=false,escaped=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(start<0){if(c!=='{')continue;start=i;depth=1;continue;}if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{events.push(JSON.parse(text.slice(start,i+1)))}catch{}start=-1;}}
 const records=events.flatMap(e=>(e.logs??[]).flatMap(l=>(l.message??[]).flatMap(m=>{try{return [JSON.parse(m)]}catch{return []}})));
 const pipeline=records.filter(r=>r.type==='V1_PIPELINE_LATENCY');
 summary.trace={events:events.length,exceptions:events.reduce((n,e)=>n+(e.exceptions?.length??0),0),outcomes:Object.fromEntries([...new Set(events.map(e=>e.outcome))].map(k=>[k,events.filter(e=>e.outcome===k).length])),pipeline: Object.fromEntries([...new Set(pipeline.map(r=>r.phase))].map(k=>{const rows=pipeline.filter(r=>r.phase===k);return [k,{samples:rows.length,medianMs:percentile(rows.map(r=>r.durationMs),.5),p95Ms:percentile(rows.map(r=>r.durationMs),.95),feedTurnHeldP95Ms:percentile(rows.filter(r=>r.stages?.FEED_TURN_HELD).map(r=>r.stages.FEED_TURN_HELD.durationMs),.95)}]}))};
 const completed=pipeline.filter(r=>r.phase==='REVIEW'&&r.outcome==='SUCCEEDED');
 summary.trace.completedReviews={samples:completed.length,medianMs:percentile(completed.map(r=>r.durationMs),.5),p95Ms:percentile(completed.map(r=>r.durationMs),.95),graphLoadMedianMs:percentile(completed.filter(r=>r.stages?.GRAPH_LOAD).map(r=>r.stages.GRAPH_LOAD.durationMs),.5),feedTurnHeldP95Ms:percentile(completed.filter(r=>r.stages?.FEED_TURN_HELD).map(r=>r.stages.FEED_TURN_HELD.durationMs),.95)};
 summary.trace.versions=[...new Set(events.map(e=>e.scriptVersion?.id).filter(Boolean))];
}catch{}
await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
