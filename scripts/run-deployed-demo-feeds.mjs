import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';

// Fixed isolated QA destination. Dataset creation and measurements use the ordinary
// authenticated application API. No SQL inserts, synthetic source items or model grants.
const origin='https://distilled-news-sources-qa.distillednews-platform.workers.dev';
const dir='.local-reports/demo-platform-20261021';
await fs.mkdir(dir,{recursive:true});
const dataset=JSON.parse(await fs.readFile('examples/demo-feeds/feeds.json','utf8'));
const resume=process.argv.includes('--resume'),observeOnly=process.argv.includes('--observe');
const report=resume||observeOnly?JSON.parse(await fs.readFile(dir+'/deployed-run.json','utf8')):{origin,branch:'codex/twenty-feed-dataset',commit:'ac6299f',datasetHash:createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),startedAt:new Date().toISOString(),schedulePolicy:'Original dataset daily schedules are retained. Collection latency is measurable now; a first full reporting window may not yet be due.',requests:[],feeds:[],snapshots:[]};
let cookie='';
try{cookie=(await fs.readFile(dir+'/dataset-session','utf8')).trim();}catch{}
let saveChain=Promise.resolve();
const save=()=>saveChain=saveChain.then(()=>fs.writeFile(dir+'/deployed-run.json',JSON.stringify(report,null,2)));
async function api(urlPath,method='GET',body,timeout=180000){
 const start=performance.now(),startedAt=new Date().toISOString();
 try{
  const response=await fetch(new URL(urlPath,origin),{method,headers:{...(cookie?{cookie}:{}),'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={error:'NON_JSON_RESPONSE',contentType:response.headers.get('content-type')};}
  const entry={path:urlPath,method,startedAt,completedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-start),status:response.status,data};
  report.requests.push(entry);
  return {entry,data,response};
 }catch(e){const entry={path:urlPath,method,startedAt,completedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-start),error:e.cause?.code??e.name};report.requests.push(entry);return {entry,data:{error:entry.error}};}
}
async function mapLimit(items,n,fn){let cursor=0;await Promise.all(Array.from({length:n},async()=>{while(cursor<items.length){const i=cursor++;await fn(items[i],i);}}));}
let session=await api('/api/auth/session');
if(!session.data.authenticated){
 let credentials;
 try{credentials=JSON.parse(await fs.readFile(dir+'/dataset-credentials.json','utf8'));}catch{}
 if(session.data.setupRequired&&!credentials){
  const text=await fs.readFile('apps/worker/.dev.vars.qa-v3','utf8');
  const value=text.match(/^ADMIN_SETUP_TOKEN\s*=\s*(.+)$/m)?.[1]?.trim();
  if(!value)throw Error('QA_SETUP_TOKEN_UNAVAILABLE');
  const setupToken=/^["']/.test(value)?value.slice(1,-1):value;
  credentials={email:'qa-dataset-20261021@distilled.example',username:'qa-dataset-owner',password:randomBytes(24).toString('base64url')};
  await fs.writeFile(dir+'/dataset-credentials.json',JSON.stringify(credentials));
  session=await api('/api/auth/setup','POST',{...credentials,setupToken});
 }else if(credentials)session=await api('/api/auth/login','POST',credentials);
 if(session.entry.status!==200||!session.data.account){await save();throw Error('QA_AUTHENTICATION_FAILED:'+session.entry.status+':'+session.data.error);}
 cookie=session.response.headers.getSetCookie().find(x=>x.startsWith('dn_session='))?.split(';')[0]??'';
 if(!cookie)throw Error('QA_SESSION_MISSING');
 await fs.writeFile(dir+'/dataset-session',cookie);
 report.username=session.data.account.username;
}else report.username=session.data.account.username;
if(report.username!=='qa-dataset-owner')throw Error('UNEXPECTED_TEST_OWNER');
await save();
if(!observeOnly){
 await mapLimit(dataset,2,async(input,index)=>{
  const id='qads_20261021_'+String(index+1).padStart(2,'0');
  if(report.feeds.some(x=>x.id===id))return;
  const feed={id,datasetId:input.id,title:input.title,sourceInputs:input.sourceInputs,startedAt:new Date().toISOString()};
  report.feeds.push(feed);
  const body={...input,id};
  const result=await api('/api/me/feeds','POST',body);
  feed.atomicCreate={status:result.entry.status,error:result.data.error,durationMs:result.entry.durationMs};
  feed.sourceApprovals=[];
  if(result.entry.status===200)feed.briefing=result.data.briefing;
  else if(result.entry.status&&result.entry.status<500||result.entry.status===503){
   // Retain the atomic failure. The normal per-source API then isolates every
   // input on the same diagnostic feed instead of hiding all behind one error.
   const {sourceInputs,...base}=body;
   const fallback=await api('/api/me/briefings','POST',base);
   feed.diagnosticCreate={status:fallback.entry.status,error:fallback.data.error,durationMs:fallback.entry.durationMs};
   if(fallback.entry.status===200){feed.briefing=fallback.data.briefing;for(const input of sourceInputs){const r=await api('/api/me/sources','POST',{briefingId:id,input});feed.sourceApprovals.push({input,status:r.entry.status,error:r.data.error,durationMs:r.entry.durationMs,result:r.data.result});await save();}}
  }
  if(feed.briefing){const sources=await api('/api/me/sources?briefingId='+id);feed.sources=sources.data.sources??[];feed.nextBriefingAt=feed.briefing.nextBriefingAt;feed.publicPath='/'+report.username+'/'+feed.briefing.slug+'/';}
  feed.creationFinishedAt=new Date().toISOString();feed.creationWallMs=Date.parse(feed.creationFinishedAt)-Date.parse(feed.startedAt);
  await save();console.log(JSON.stringify({phase:'create',number:index+1,title:feed.title,status:feed.atomicCreate.status,error:feed.atomicCreate.error,approvedSources:feed.sources?.length??0,durationMs:feed.creationWallMs,nextBriefingAt:feed.nextBriefingAt}));
 });
 report.creationCompletedAt=new Date().toISOString();await save();
}
const minutes=Number(process.env.DATASET_OBSERVE_MINUTES??3);
if(!Number.isFinite(minutes)||minutes<0||minutes>30)throw Error('INVALID_OBSERVATION_DURATION');
const end=Date.now()+minutes*60000;
do{
 const snapshot={at:new Date().toISOString(),feeds:[]};
 await mapLimit(report.feeds.filter(x=>x.briefing),4,async feed=>{
  const health=await api('/api/me/health?briefingId='+feed.id);
  const publicFeed=await api('/api/feed/'+report.username+'/'+encodeURIComponent(feed.briefing.slug));
  const state={id:feed.id,healthStatus:health.entry.status,healthDurationMs:health.entry.durationMs,health:health.data.health,readerStatus:publicFeed.entry.status,readerDurationMs:publicFeed.entry.durationMs,publicationState:publicFeed.data.publicationState,publicationProgress:publicFeed.data.publicationProgress,sourceAvailability:publicFeed.data.sourceAvailability,editionCount:publicFeed.data.editions?.length??0};
  snapshot.feeds.push(state);
  feed.latest=state;
  if(state.editionCount&&!feed.firstPublishedObservedAt)feed.firstPublishedObservedAt=new Date().toISOString();
 });
 report.snapshots.push(snapshot);await save();console.log(JSON.stringify({phase:'snapshot',at:snapshot.at,feeds:snapshot.feeds.length,published:snapshot.feeds.filter(x=>x.editionCount).length,states:Object.fromEntries(Object.entries(Object.groupBy(snapshot.feeds,x=>x.publicationState??'UNREPORTED')).map(([k,v])=>[k,v.length]))}));
 if(Date.now()>=end)break;
 await new Promise(resolve=>setTimeout(resolve,Math.min(45000,end-Date.now())));
}while(Date.now()<=end);
report.observationCompletedAt=new Date().toISOString();await save();
console.log(JSON.stringify({out:dir+'/deployed-run.json',feeds:report.feeds.length,atomicCreated:report.feeds.filter(x=>x.atomicCreate.status===200).length,diagnosticCreated:report.feeds.filter(x=>x.diagnosticCreate?.status===200).length,approvedSourceAssignments:report.feeds.reduce((n,x)=>n+(x.sources?.length??0),0)}));
