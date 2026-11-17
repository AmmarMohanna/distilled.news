import fs from 'node:fs/promises';
import path from 'node:path';

const origin='https://distilled-news-sources-qa.distillednews-platform.workers.dev';
const root=process.cwd(),out=path.join(root,'.local-reports','demo-platform-20261021');
await fs.mkdir(out,{recursive:true});
const report={origin,startedAt:new Date().toISOString(),requests:[],feeds:[]};
const write=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
let cookie='';
try{cookie=(await fs.readFile('.review-tmp/five-qa-cookie','utf8')).trim();}catch{}
async function api(urlPath,{method='GET',body,timeout=90000}={}){
 const start=performance.now(),startedAt=new Date().toISOString();
 try{
  const response=await fetch(new URL(urlPath,origin),{method,headers:{...(cookie?{cookie}:{}),'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={nonJson:true,contentType:response.headers.get('content-type')};}
  const entry={path:urlPath,method,startedAt,durationMs:Math.round(performance.now()-start),status:response.status,data};
  report.requests.push(entry);
  return {entry,data,response};
 }catch(e){const entry={path:urlPath,method,startedAt,durationMs:Math.round(performance.now()-start),error:e.cause?.code??e.name};report.requests.push(entry);return {entry,data:{error:entry.error}};}
}
await api('/api/auth/session');
let account=await api('/api/me/account');
if(account.entry.status===401){
 const credentialsPath='C:/Users/Admin/Documents/Codex/2026-10-04/ok-i-fcan-see-the-r2/continue-main2/.review-tmp/sources-qa-credentials.json';
 try{
  const credentials=JSON.parse(await fs.readFile(credentialsPath,'utf8'));
  const result=await api('/api/auth/login',{method:'POST',body:credentials});
  if(result.entry.status===200){cookie=result.response.headers.getSetCookie().find(x=>x.startsWith('dn_session='))?.split(';')[0]??'';await fs.writeFile(path.join(out,'session-cookie'),cookie);account=await api('/api/me/account');}
 }catch{report.authentication='SAVED_CREDENTIALS_UNAVAILABLE';}
}
report.authentication=account.entry.status===200?'AUTHENTICATED':report.authentication??'NOT_AUTHENTICATED';
if(account.entry.status===200){report.account=account.data.account;await api('/api/me/briefings');}
try{
 const token=(await fs.readFile(path.join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'),'utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026/workers/scripts/distilled-news-sources-qa/settings',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 const b=await r.json();
 if(r.ok&&b.success){const bindings=b.result.bindings??[];report.runtime={variables:Object.fromEntries(bindings.filter(x=>x.type==='plain_text'&&/^(BRIEFING_|PRODUCT_FEEDS_ENABLED$|SOURCE_QUEUE_SCHEDULING_ENABLED$|V1_DOWNSTREAM_ENABLED$|V1_REAL_MODEL_REQUIRED$|SOURCE_CONNECTORS_ENABLED$|SOURCE_FULL_ARTICLES_ENABLED$|SOURCE_GOOGLE_RESOLUTION_ENABLED$)/.test(x.name)).map(x=>[x.name,x.text])),database:bindings.filter(x=>x.name==='DB').map(x=>({name:x.name,id:x.id})),secretNames:bindings.filter(x=>x.type==='secret_text').map(x=>x.name)};}
 else report.runtime={settingsReadStatus:r.status,errorCodes:(b.errors??[]).map(x=>x.code)};
}catch(e){report.runtime={error:e.cause?.code??e.name};}
await write();
console.log(JSON.stringify({out,authentication:report.authentication,username:report.account?.username,runtime:report.runtime,requests:report.requests.map(({path,status,error,durationMs,data})=>({path,status,error,durationMs,...(data.error?{apiError:data.error}:{})})),existingFeeds:report.requests.find(x=>x.path==='/api/me/briefings')?.data.briefings?.map(x=>({id:x.id,title:x.title,paused:x.paused}))}));
