#!/usr/bin/env node
/** Read-only concurrency probe for a QA deployment.
 *
 * It ramps concurrent GET requests across the feed page, one edition and,
 * when admin credentials are given, the admin pipeline trace. It never writes:
 * the only POST is the login that creates a session cookie.
 *
 *   QA_BASE_URL=https://<qa-host> \
 *   QA_EMAIL=... QA_PASSWORD=... \            # optional, for private feeds and the trace
 *   node scripts/load-qa-reads.mjs --steps 10,20,50,100 --seconds 60 --pause 20 --out .review-tmp/load
 *
 * Credentials are read from the environment only and are never written to the report.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const base=(process.env.QA_BASE_URL??'').replace(/\/$/,'');
if(!/^https:\/\//.test(base))throw new Error('Set QA_BASE_URL to the https origin of the QA worker.');
const steps=String(arg('--steps','10,20,50,100')).split(',').map(Number);
const seconds=Number(arg('--seconds',60)),pause=Number(arg('--pause',20)),out=String(arg('--out','.review-tmp/load'));
const routes=String(arg('--routes','feed,edition,trace')).split(',');
if(steps.some(n=>!Number.isInteger(n)||n<1||n>200))throw new Error('--steps must be integers from 1 to 200.');
if(!Number.isFinite(seconds)||seconds<5||seconds>300)throw new Error('--seconds must be between 5 and 300.');

let cookie='';
async function login(){
 if(!process.env.QA_EMAIL||!process.env.QA_PASSWORD)return;
 const response=await fetch(`${base}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.QA_EMAIL,password:process.env.QA_PASSWORD})});
 if(!response.ok)throw new Error(`Login failed with HTTP ${response.status}.`);
 cookie=(response.headers.getSetCookie?.()??[response.headers.get('set-cookie')??'']).map(v=>v.split(';')[0]).filter(Boolean).join('; ');
}
const get=(url,headers={})=>fetch(url,{headers:{...(cookie?{cookie}:{}),...headers},redirect:'manual'});

/** Targets come from the signed-in account's feeds, or from QA_FEEDS=user/slug,user/slug. */
async function targets(){
 let feeds=[];
 if(process.env.QA_FEEDS)feeds=process.env.QA_FEEDS.split(',').map(v=>{const [username,slug]=v.trim().split('/');return {username,slug};});
 else if(cookie){
  const me=await (await get(`${base}/api/me/briefings`)).json();
  const list=me.briefings??me.feeds??[];
  const account=await (await get(`${base}/api/me/account`)).json().catch(()=>({}));
  const username=account.account?.username??process.env.QA_USERNAME;
  feeds=list.map(f=>({id:f.id,username,slug:f.slug}));
 }
 if(!feeds.length||feeds.some(f=>!f.username||!f.slug))throw new Error('No feeds found. Set QA_FEEDS=user/slug,... or QA_EMAIL/QA_PASSWORD (and QA_USERNAME if needed).');
 const out=[];
 for(const feed of feeds){
  const page=await get(`${base}/api/feed/${encodeURIComponent(feed.username)}/${encodeURIComponent(feed.slug)}`);
  const body=page.ok?await page.json():{};
  out.push({...feed,id:feed.id??body.briefing?.id,editionId:body.editions?.[0]?.id});
 }
 return out;
}

function requestsFor(feeds){
 const list=[];
 for(const f of feeds){
  const feed=`${base}/api/feed/${encodeURIComponent(f.username)}/${encodeURIComponent(f.slug)}`;
  if(routes.includes('feed'))list.push({route:'feed',url:feed});
  if(routes.includes('edition')&&f.editionId)list.push({route:'edition',url:`${feed}/editions/${encodeURIComponent(f.editionId)}`});
  if(routes.includes('trace')&&cookie&&f.id)list.push({route:'trace',url:`${base}/api/admin/briefings/${encodeURIComponent(f.id)}/pipeline-trace`});
 }
 return list;
}

const pct=(values,p)=>{if(!values.length)return null;const s=[...values].sort((a,b)=>a-b);return Math.round(s[Math.min(s.length-1,Math.floor(p*s.length))]);};
async function runStep(concurrency,requests){
 const until=Date.now()+seconds*1000,samples=[];let cursor=0;
 const worker=async()=>{while(Date.now()<until){
  const target=requests[cursor++%requests.length],started=performance.now();let status=0,code;
  try{const response=await get(target.url);status=response.status;
   if(status>=400){const text=await response.text();try{code=JSON.parse(text).code??JSON.parse(text).error}catch{code=undefined}}else await response.arrayBuffer();}
  catch(error){status=-1;code=error instanceof Error?error.name:'ERROR';}
  samples.push({route:target.route,status,code,ms:performance.now()-started});
 }};
 await Promise.all(Array.from({length:concurrency},worker));
 const byRoute={};
 for(const route of new Set(samples.map(s=>s.route))){
  const rows=samples.filter(s=>s.route===route),ok=rows.filter(s=>s.status>=200&&s.status<400);
  const errors={};for(const s of rows.filter(s=>s.status<200||s.status>=400)){const key=`${s.status}${s.code?` ${s.code}`:''}`;errors[key]=(errors[key]??0)+1;}
  byRoute[route]={requests:rows.length,errorRate:Number(((rows.length-ok.length)/rows.length).toFixed(4)),p50Ms:pct(ok.map(s=>s.ms),0.5),p95Ms:pct(ok.map(s=>s.ms),0.95),errors};
 }
 return {concurrency,seconds,requests:samples.length,byRoute};
}

await login();
const feeds=await targets(),requests=requestsFor(feeds);
console.log(`${feeds.length} feeds, ${requests.length} distinct requests, routes: ${[...new Set(requests.map(r=>r.route))].join(', ')}`);
const report={base:new URL(base).host,startedAt:new Date().toISOString(),seconds,pause,steps:[]};
for(const [i,concurrency] of steps.entries()){
 const step=await runStep(concurrency,requests);report.steps.push(step);
 console.log(JSON.stringify(step));
 if(i<steps.length-1)await new Promise(r=>setTimeout(r,pause*1000));
}
report.finishedAt=new Date().toISOString();
const lines=['| Concurrency | Route | Requests | Error rate | p50 ms | p95 ms | Errors |','|---|---|---|---|---|---|---|'];
for(const step of report.steps)for(const [route,r] of Object.entries(step.byRoute))
 lines.push(`| ${step.concurrency} | ${route} | ${r.requests} | ${(r.errorRate*100).toFixed(1)}% | ${r.p50Ms??'-'} | ${r.p95Ms??'-'} | ${Object.entries(r.errors).map(([k,v])=>`${k}: ${v}`).join(', ')||'-'} |`);
await mkdir(out,{recursive:true});
const stamp=report.startedAt.replace(/[:.]/g,'-');
await writeFile(path.join(out,`load-${stamp}.json`),JSON.stringify(report,null,1));
await writeFile(path.join(out,`load-${stamp}.md`),`# QA read load, ${report.startedAt}\n\n${lines.join('\n')}\n`);
console.log(lines.join('\n'));
