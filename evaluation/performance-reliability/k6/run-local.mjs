import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixtureServer} from './fixture-server.mjs';
import {configuration} from './config.js';
const requested=process.argv[2]||'smoke',proof=requested==='fault-proof',profile=proof?'smoke':requested;
const env={...process.env,BASE_URL:'http://127.0.0.1:8789',FEED_USER:'fixture',FEED_SLUG:'news',EDITION_ID:'edition-1'};
const config=configuration(profile,env);
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=resolve(root,'.local-reports/k6',requested);await mkdir(out,{recursive:true});
env.RESULT_DIR=out.replaceAll('\\','/');env.COMMIT_SHA=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();env.RUN_STARTED_AT=new Date().toISOString();
const binary=process.env.K6_BIN||'k6';
env.K6_VERSION=execFileSync(binary,['version'],{encoding:'utf8'}).trim();
const harnessDirectory=fileURLToPath(new URL('./',import.meta.url)),hash=createHash('sha256');
for(const name of readdirSync(harnessDirectory).sort())if(/\.(js|mjs|md|json)$/.test(name))hash.update(name+'\0').update(readFileSync(resolve(harnessDirectory,name)));
hash.update(readFileSync(resolve(root,'pnpm-lock.yaml')));env.HARNESS_SHA256=hash.digest('hex');
const workingTreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim());
const server=fixtureServer(proof?'persistent':profile==='fault'?'transient':'none');
await new Promise((done,reject)=>{server.once('error',reject);server.listen(8789,'127.0.0.1',done);});
let timedOut=false;
try{
 const child=spawn(binary,['run','--out','json='+out.replaceAll('\\','/')+'/samples.json',fileURLToPath(new URL(profile+'.js',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},profile==='soak'?330000:profile==='stress'?150000:65000);
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>child.kill('SIGTERM'));
 let code;try{code=await new Promise((done,reject)=>{child.once('error',reject);child.once('close',done);});}finally{clearTimeout(timer);}
 await writeFile(resolve(out,'execution.json'),JSON.stringify({schemaVersion:'distilled-k6-execution.v1',profile,expectedThresholdFailure:proof,exitCode:code,timedOut,commit:env.COMMIT_SHA,startedAt:env.RUN_STARTED_AT,finishedAt:new Date().toISOString(),mode:'OFFLINE_CONTRACT',workingTreeDirty,harnessSha256:env.HARNESS_SHA256,k6Version:env.K6_VERSION,fixtureFault:proof?'persistent':profile==='fault'?'transient':'none',settings:config.options},null,2));
 await writeFile(resolve(out,'k6.log'),log);
 console.log(JSON.stringify({profile,code,timedOut,out,expectedThresholdFailure:proof}));
 if(timedOut||code!==(proof?99:0))process.exitCode=1;
}finally{await new Promise(done=>server.close(done));}
