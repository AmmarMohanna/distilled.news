import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';

// Explicitly scoped to Joud's deployment. Secrets remain in ignored local files.
const origin='https://distilled-news-joud.distillednews-platform.workers.dev';
const directory='.local-reports/source-matrix-20261024';
const vars=await fs.readFile('apps/worker/.dev.vars.joud','utf8');
const value=name=>vars.match(new RegExp('^'+name+'\\s*=\\s*(.+)$','m'))?.[1]?.trim().replace(/^["']|["']$/g,'');
const ownerAccountId='account_91df4e53-99c6-4e65-baf5-91030a2d6fe2';
const payload=Buffer.from(JSON.stringify({sub:ownerAccountId,role:'admin',exp:Math.floor(Date.now()/1000)+14400})).toString('base64url');
if(!value('ADMIN_SESSION_SECRET')||!value('INTERNAL_MAINTENANCE_SECRET'))throw Error('LOCAL_JOUD_AUTH_UNAVAILABLE');
const cookie='dn_session='+payload+'.'+createHmac('sha256',value('ADMIN_SESSION_SECRET')).update(payload).digest('base64url');
const topics=[
 ['Artificial intelligence','AI model releases, machine learning research and AI industry developments worldwide'],
 ['Cybersecurity','Cybersecurity vulnerabilities, breaches, threat intelligence and defensive security research'],
 ['Solar energy','Solar photovoltaic technology, projects, energy policy and solar industry developments'],
 ['Lebanon economy','Lebanon economy, banking reform, public finances and economic policy'],
 ['Lamine Yamal','Lamine Yamal performances, interviews, injuries and FC Barcelona developments involving him'],
 ['Space exploration','Space missions, astronomy discoveries, launch vehicles and space research'],
 ['Diabetes research','Diabetes clinical research, treatments, medical devices and scientific findings'],
 ['Electric vehicles','Electric vehicles, batteries, charging infrastructure and automotive industry developments'],
 ['Coffee farming','Coffee farming, crop science, coffee producers, trade and agricultural developments'],
 ['Marine conservation','Marine biodiversity, ocean conservation, fisheries policy and coral reef research'],
 ['Quantum computing','Quantum computing research, quantum hardware and algorithms'],
 ['Lebanese basketball','Lebanese basketball clubs, national team, league games and players'],
 ['Fashion industry','Fashion designers, brands, runway collections and fashion industry business'],
 ['Video games','Video game releases, game development, studios and gaming industry news'],
 ['Ancient Egypt','Ancient Egyptian history, archaeology, excavations, museum collections and historical research'],
 ['الزراعة في لبنان','أخبار الزراعة والمزارعين والمحاصيل والسياسات الزراعية في لبنان'],
 ['French cinema','French cinema releases, filmmakers, festivals and film industry developments in France'],
 ['Open source software','Open source software projects, releases, maintainers and software community developments'],
 ['Climate policy','Climate change policy, emissions regulation, international climate negotiations and climate science'],
 ['Sourdough bread','Sourdough bread baking, fermentation science, artisan bakeries and bread research']
];
await fs.mkdir(directory,{recursive:true});
const phase=process.env.MATRIX_PHASE??'baseline';
const reportPath=directory+'/'+phase+'.json';
let report;try{report=JSON.parse(await fs.readFile(reportPath,'utf8'));}catch{report={origin,phase,startedAt:new Date().toISOString(),results:[]};}
if(process.env.MATRIX_VERSION){if(report.deployedVersion&&report.deployedVersion!==process.env.MATRIX_VERSION)throw Error('MATRIX_DEPLOYMENT_CHANGED');report.deployedVersion=process.env.MATRIX_VERSION;}
let writes=Promise.resolve();const save=()=>writes=writes.then(()=>fs.writeFile(reportPath,JSON.stringify(report,null,2)));
async function api(path,body,{internal=false}={}){
 const start=Date.now();
 const trace=internal&&path.endsWith('/recommend')?phase+'-'+crypto.randomUUID():undefined;
 let progressEvents=0,lastProgressSourceCount=0,diagnostics=[],heartbeats=0;
 try{const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{origin,connection:'close','content-type':'application/json',...(internal?{'x-distilled-internal':value('INTERNAL_MAINTENANCE_SECRET'),...(path.endsWith('/recommend')?{accept:'application/x-ndjson','x-distilled-test-trace':trace}:{})}:{cookie})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});
  let data;
  if(r.headers.get('content-type')?.includes('application/x-ndjson')){
   const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';data={error:'INCOMPLETE_RECOMMENDATION_STREAM'};
   const consume=line=>{if(!line.trim()){heartbeats++;return;}const event=JSON.parse(line);if(event.type==='complete')data=event;else if(event.type==='error')data={error:event.error};else if(event.type==='progress'){progressEvents++;lastProgressSourceCount=event.sources?.length??0;if(Array.isArray(event.diagnostics))diagnostics=event.diagnostics;}};
   for(;;){const part=await reader.read();buffer+=decoder.decode(part.value??new Uint8Array(),{stream:!part.done});let newline;while((newline=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,newline));buffer=buffer.slice(newline+1);}if(part.done)break;}consume(buffer);
  }else{const text=await r.text();try{data=JSON.parse(text);}catch{data={error:'NON_JSON_RESPONSE'};}}
  return {trace,status:r.status,durationMs:Date.now()-start,data,...(heartbeats?{heartbeats}:{}),...(progressEvents?{progressEvents,lastProgressSourceCount,diagnostics}:{})};}
 catch(e){return {trace,status:0,durationMs:Date.now()-start,data:{error:e.name,...(e.name==='SyntaxError'?{parseError:e.message.slice(0,250)}:{}),...(e.cause?.code?{transportCode:e.cause.code}:{})},...(heartbeats?{heartbeats}:{}),...(progressEvents?{progressEvents,lastProgressSourceCount,diagnostics}:{})};}
}
function channel(source){return /t\.me\//.test(source)?'telegram':/(?:x|twitter)\.com\//.test(source)?'x':/linkedin\.com\//.test(source)?'linkedin':/^news:/.test(source)?'google_news':/^rss:|\.(?:xml|rss|atom)(?:\?|$)|\/feed\/?(?:\?|$)/.test(source)?'rss':'website';}
const session=await api('/api/auth/session');if(!session.data.authenticated||session.data.account?.id!==ownerAccountId)throw Error('JOUD_AUTH_FAILED');
const budgetAtStart=(await api('/api/internal/collectors/status',undefined,{internal:true})).data;if(report.budgetBefore)report.budgetAtResume=budgetAtStart;else report.budgetBefore=budgetAtStart;
await save();
let cursor=0;
const concurrency=Number(process.env.MATRIX_CONCURRENCY??2);
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>3)throw Error('INVALID_MATRIX_CONCURRENCY');
await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<topics.length){
 const index=cursor++;if(process.env.MATRIX_ONLY&&!process.env.MATRIX_ONLY.split(',').includes(String(index+1)))continue;
 if(report.results.some(r=>r.index===index+1))continue;
 const [title,description]=topics[index];
 const id='briefing_source_matrix_20261024_'+String(index+1).padStart(2,'0');
 const result={index:index+1,id,title,description};report.results.push(result);
 // Create paused before approving sources so Cron cannot start ongoing collection.
 result.create=await api('/api/me/briefings',{id,slug:'source-matrix-20261024-'+String(index+1).padStart(2,'0'),title,interestProfile:description,publicFeedEnabled:true,paused:true,updateIntervalMinutes:1440,briefingTimeOfDay:'09:00',briefingTimezone:'Asia/Beirut',language:index===15?'ar':'en'});
 await save();
 if(result.create.status!==200){await save();console.log(JSON.stringify({index:index+1,error:'CREATE_FAILED',status:result.create.status}));continue;}
 result.recommendation=await api('/api/internal/collectors/recommend',{ownerAccountId,title,description},{internal:true});
 const sources=result.recommendation.data.sources??[];
 result.count=sources.length;result.channels=Object.fromEntries(Object.entries(Object.groupBy(sources,channel)).map(([key,values])=>[key,values.length]));
 result.incomplete=result.recommendation.data.type!=='complete';
 result.passesCount=!result.incomplete&&result.recommendation.status===200&&sources.length>=15&&sources.length<=20;
 await save();console.log(JSON.stringify({phase,index:index+1,title,count:result.count,channels:result.channels,ms:result.recommendation.durationMs,status:result.recommendation.status}));
 if(sources.length){
  result.save=await api('/api/me/feeds',{id,title,interestProfile:description,sourceInputs:sources,publicFeedEnabled:true,updateIntervalMinutes:1440,briefingTimeOfDay:'09:00',briefingTimezone:'Asia/Beirut',language:index===15?'ar':'en'});
  const saved=await api('/api/me/sources?briefingId='+id);result.readbackStatus=saved.status;result.persistedCount=saved.status===200&&Array.isArray(saved.data.sources)?saved.data.sources.length:undefined;result.savedSources=saved.data.sources;
  result.paused=result.save.data.briefing?.paused??result.create.data.briefing.paused;
 }
 await save();console.log(JSON.stringify({phase,index:index+1,savedStatus:result.save?.status,persisted:result.persistedCount,paused:result.paused}));
}}));
report.budgetAfter=(await api('/api/internal/collectors/status',undefined,{internal:true})).data;report.completedAt=new Date().toISOString();await save();
console.log(JSON.stringify({report:reportPath,tested:report.results.length,passes:report.results.filter(r=>r.passesCount).length,persisted:report.results.filter(r=>r.persistedCount>=15).length}));
