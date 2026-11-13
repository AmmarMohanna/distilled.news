import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';

// Explicitly approved, read-only Joud diagnostics. Never calls assessment,
// inference, collection submission, notifications or feed mutation endpoints.
const origin='https://distilled-news-joud.distillednews-platform.workers.dev';
const vars=await fs.readFile('apps/worker/.dev.vars.joud','utf8');
const secret=vars.match(/^ADMIN_SESSION_SECRET\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
if(!secret)throw Error('LOCAL_JOUD_AUTH_UNAVAILABLE');
const payload=Buffer.from(JSON.stringify({sub:'account_91df4e53-99c6-4e65-baf5-91030a2d6fe2',role:'admin',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const cookie='dn_session='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
const google='https://news.google.com/rss/search?q=Georges+Khabbaz&hl=en-US&gl=US&ceid=US%3Aen';
const paths=process.argv.includes('--search-only')?[
 '/api/me/sources/search?q=Georges%20Khabbaz',
 '/api/me/sources/search?q=Georges%20Khabbaz',
]:process.argv.includes('--browser-and-search')?[
 '/api/admin/source-execution-status?kind=playwright&sourceUrl='+encodeURIComponent('https://lovin.co/'),
 '/api/me/sources/search?q=Georges%20Khabbaz',
 '/api/me/sources/search?q=Georges%20Khabbaz',
]:[
 '/api/admin/source-execution-status?sourceUrl='+encodeURIComponent('https://lovin.co/'),
 '/api/admin/source-execution-status?kind=google_feed&sourceUrl='+encodeURIComponent(google),
];
const report={at:new Date().toISOString(),origin,checks:[]};
for(const path of paths){
 const started=Date.now();let result;
 try{const response=await fetch(origin+path,{headers:{cookie},signal:AbortSignal.timeout(25_000)});const data=await response.json();result={path,status:response.status,elapsedMs:Date.now()-started,result:Array.isArray(data.results)?{count:data.results.length,unavailable:data.unavailable,lovinPresent:data.results.some(row=>row.publisher==='lovin.co')}:data};}
 catch(error){result={path,elapsedMs:Date.now()-started,error:error.cause?.code??error.name};}
 report.checks.push(result);console.log(JSON.stringify(result));
}
await fs.mkdir('.local-reports/source-search-latency',{recursive:true});
const reportPath='.local-reports/source-search-latency/'+report.at.replace(/[:.]/g,'-')+'.json';
await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({reportPath}));
