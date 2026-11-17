import fs from 'node:fs/promises';
// Reuse only the dedicated dataset owner's 40 feeds. No financial, canonical
// evidence or schedule SQL mutations; the normal admin lifecycle API owns pause.
const baseline='.local-reports/demo-platform-20261021';
const dir=process.env.DATASET_FIXES_REPORT_DIR??'.local-reports/demo-platform-fixes-20261021';
const origin='https://distilled-news-sources-qa.distillednews-platform.workers.dev';
const manifest=JSON.parse(await fs.readFile(baseline+'/deployed-run.json','utf8'));
const cookie=(await fs.readFile(baseline+'/dataset-session','utf8')).trim();
const ids=new Set(manifest.feeds.map(f=>f.id));
if(ids.size!==40||[...ids].some(id=>!/^qads_20261021_\d{2}$/.test(id)))throw Error('INVALID_MANIFEST');
await fs.mkdir(dir,{recursive:true});
process.env.DATASET_REPORT_DIR=dir;
const report={startedAt:new Date().toISOString(),origin,requests:[],snapshots:[],cleanup:[]};
const save=()=>fs.writeFile(dir+'/retest.json',JSON.stringify(report,null,2));
async function api(path,method='GET',body){
 const start=Date.now();
 const r=await fetch(origin+path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});
 const data=await r.json();report.requests.push({at:new Date().toISOString(),path,method,status:r.status,durationMs:Date.now()-start});
 if(r.status!==200)throw Error('API_'+r.status+':'+path);
 return data;
}
async function map(items,n,fn){let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length)await fn(items[i++]);}));}
async function snapshot(){
 await import('./snapshot-demo-platform.mjs?tick='+Date.now());
 const entry={at:new Date().toISOString(),feeds:[]};
 await map(manifest.feeds,4,async f=>{
  const reader=await api('/api/feed/'+manifest.username+'/'+encodeURIComponent(f.briefing.slug));
  entry.feeds.push({id:f.id,state:reader.publicationState,progress:reader.publicationProgress,availability:reader.sourceAvailability,editions:reader.editions?.length??0});
 });
 report.snapshots.push(entry);await save();
 console.log(JSON.stringify({phase:'reader-snapshot',at:entry.at,feeds:entry.feeds.length,published:entry.feeds.filter(f=>f.editions).length}));
}
const me=await api('/api/me/account');if(me.account?.username!=='qa-dataset-owner')throw Error('WRONG_OWNER');
const before=await api('/api/me/briefings');
if(before.briefings.filter(f=>ids.has(f.id)&&f.paused).length!==40)throw Error('EXPECTED_ALL_TEST_FEEDS_PAUSED');
await snapshot();
try{
 await map([...ids],4,async id=>{const r=await api('/api/admin/briefings/'+id,'PATCH',{paused:false});if(r.briefing?.paused!==false)throw Error('UNPAUSE_FAILED');});
 report.activatedAt=new Date().toISOString();await save();
 console.log(JSON.stringify({phase:'activated',feeds:40,at:report.activatedAt}));
 const until=Date.now()+6*60000;
 do{await snapshot();if(Date.now()>=until)break;await new Promise(resolve=>setTimeout(resolve,45000));}while(true);
}catch(error){report.error=error.message;throw error;}finally{
 // Even on measurement failure, every requested lifecycle cleanup is attempted.
 await map([...ids],4,async id=>{try{const r=await api('/api/admin/briefings/'+id,'PATCH',{paused:true});report.cleanup.push({id,paused:r.briefing?.paused===true});}catch{report.cleanup.push({id,paused:false});}});
 const after=await api('/api/me/briefings');report.verifiedPaused=after.briefings.filter(f=>ids.has(f.id)&&f.paused).length;
 report.finishedAt=new Date().toISOString();await save();
 console.log(JSON.stringify({phase:'cleanup',paused:report.verifiedPaused,at:report.finishedAt}));
 if(report.verifiedPaused!==40)throw Error('CLEANUP_INCOMPLETE');
}
