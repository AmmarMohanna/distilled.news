import fs from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
if(!process.argv.includes('--authorize-max-usd=0.10'))throw Error('EXPLICIT_0_10_USD_AUTHORIZATION_REQUIRED');
const directory='.local-reports/lovin-paid-probe';await fs.mkdir(directory,{recursive:true});
const path=directory+'/operation.json';let operation;
try{operation=JSON.parse(await fs.readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;operation={probeId:randomUUID(),authorizedMaxUsd:0.10,createdAt:new Date().toISOString()};await fs.writeFile(path,JSON.stringify(operation,null,2),{flag:'wx'});}
const vars=await fs.readFile('apps/worker/.dev.vars.joud','utf8');const secret=vars.match(/^ADMIN_SESSION_SECRET\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');if(!secret)throw Error('LOCAL_AUTH_UNAVAILABLE');
const payload=Buffer.from(JSON.stringify({sub:'account_91df4e53-99c6-4e65-baf5-91030a2d6fe2',role:'admin',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');const cookie='dn_session='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
let target='https://lovin.co/';
for(const phase of ['homepage','article']){
 const response=await fetch('https://distilled-news-joud.distillednews-platform.workers.dev/api/admin/source-execution-paid-probe',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({...operation,createdAt:undefined,phase,url:target}),signal:AbortSignal.timeout(90000)});
 const result=await response.json();await fs.writeFile(directory+'/'+phase+'.json',JSON.stringify({status:response.status,result},null,2));console.log(JSON.stringify({phase,status:response.status,result}));
 if(!response.ok||result.upstreamStatus!==200)break;
 const links=(result.articleLinks??[]).filter(url=>{try{return new URL(url).origin==='https://lovin.co'&&new URL(url).pathname!=='/';}catch{return false;}});
 const next=links.find(url=>new URL(url).pathname.startsWith('/beirut/'))??links[0];
 if(!next)break;
 const targetPath=directory+'/article-target.json';
 try{target=JSON.parse(await fs.readFile(targetPath,'utf8')).url;}catch(error){if(error.code!=='ENOENT')throw error;target=next;await fs.writeFile(targetPath,JSON.stringify({url:target}),{flag:'wx'});}
}
