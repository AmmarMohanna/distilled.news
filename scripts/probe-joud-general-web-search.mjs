import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';
if(!process.argv.includes('--authorize-max-usd=0.10'))throw Error('EXPLICIT_0_10_USD_AUTHORIZATION_REQUIRED');
const directory='.local-reports/general-web-search-probe';await fs.mkdir(directory,{recursive:true});
const operation={probeId:'general-web-search-2026-11-13-v1',authorizedMaxUsd:0.10};
try{await fs.writeFile(directory+'/operation.json',JSON.stringify(operation,null,2),{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
const vars=await fs.readFile('apps/worker/.dev.vars.joud','utf8');
const secret=vars.match(/^ADMIN_SESSION_SECRET\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');if(!secret)throw Error('LOCAL_AUTH_UNAVAILABLE');
const payload=Buffer.from(JSON.stringify({sub:'account_91df4e53-99c6-4e65-baf5-91030a2d6fe2',role:'admin',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
const cookie='dn_session='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
const start=Date.now();
const response=await fetch('https://distilled-news-joud.distillednews-platform.workers.dev/api/admin/general-web-search-probe',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(operation),signal:AbortSignal.timeout(75000)});
const result=await response.json();const report={status:response.status,elapsedMs:Date.now()-start,result};
await fs.writeFile(directory+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(!response.ok)process.exitCode=1;
