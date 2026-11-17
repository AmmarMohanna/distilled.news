import fs from 'node:fs/promises';
const dir='.local-reports/demo-platform-20261021',origin='https://distilled-news-sources-qa.distillednews-platform.workers.dev';
const run=JSON.parse(await fs.readFile(dir+'/deployed-run.json','utf8'));
const cookie=(await fs.readFile(dir+'/dataset-session','utf8')).trim();
const report={startedAt:new Date().toISOString(),feeds:[]};
let next=0,completed=0;
async function get(path){const start=performance.now(),at=new Date().toISOString();try{const r=await fetch(origin+path,{headers:{cookie},signal:AbortSignal.timeout(60000),redirect:'error'});const data=await r.json();return {path,at,status:r.status,durationMs:Math.round(performance.now()-start),data};}catch(e){return {path,at,durationMs:Math.round(performance.now()-start),error:e.cause?.code??e.name};}}
await Promise.all(Array.from({length:4},async()=>{
 while(next<run.feeds.length){
  const feed=run.feeds[next++];if(!feed.briefing)continue;
  const detail={id:feed.id,title:feed.title,sources:[]};
  for(const source of feed.sources??[]){const health=await get('/api/me/sources/'+encodeURIComponent(source.id)+'/connector-health?briefingId='+feed.id);detail.sources.push({id:source.id,kind:source.kind,input:source.input,url:source.sourceUrl??source.url,title:source.title,...health});}
  detail.trace=await get('/api/admin/briefings/'+feed.id+'/pipeline-trace?view=overview&pageSize=5');
  detail.sourceTrace=await get('/api/admin/briefings/'+feed.id+'/pipeline-trace?view=sources&pageSize=10');
  report.feeds.push(detail);
  if(++completed%5===0)console.log(JSON.stringify({phase:'source-details',feeds:completed,sources:report.feeds.reduce((n,x)=>n+x.sources.length,0)}));
 }
}));
report.completedAt=new Date().toISOString();
await fs.writeFile(dir+'/source-diagnostics.json',JSON.stringify(report,null,2));
const sources=report.feeds.flatMap(f=>f.sources.map(s=>({...s,feedId:f.id})));
const counts={};for(const s of sources){const status=s.data?.health?.lastAcceptedBatchAt?'RECEIPTED':s.data?.health?.latestJob?.lastError??s.data?.health?.latestJob?.state??'NOT_STARTED';counts[status]=(counts[status]??0)+1;}
console.log(JSON.stringify({feeds:report.feeds.length,sources:sources.length,states:counts,apiErrors:sources.filter(s=>s.status!==200).map(s=>({id:s.id,status:s.status,error:s.data?.error??s.error}))}));
