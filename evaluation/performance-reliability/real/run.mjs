import {reserveControlPlane} from './control-budget.mjs';
import {observeResources} from './resource-window.mjs';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {validateManifest,preflight,admit,digest} from './manifest.mjs';
import {ApplicationClient,privateDirectory,writePrivate,readRegistry,journal,lockRun} from './client.mjs';
import {setup,reconcileSetup,archive} from './lifecycle.mjs';
import {CampaignObservation,observeOnce} from './observer.mjs';
import {renderReport} from './report.mjs';
import {inspectResources} from './resources.mjs';
import {exportMetrics} from './telemetry.mjs';

const [command,manifestPath,preflightPath,approvalPath]=process.argv.slice(2);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
if(!command||!manifestPath)throw Error('Usage: node evaluation/performance-reliability/real/run.mjs validate|preflight|setup|resume|plan|observe|traffic|campaign|cleanup|report MANIFEST [PREFLIGHT APPROVAL]');
const m=validateManifest(read(manifestPath)),dir=privateDirectory(m.runId);
if(command==='validate'){console.log(JSON.stringify({valid:true,manifestHash:digest(m),runsLaunched:0}));process.exit(0)}
if(command==='inspect-resources'){const result=await inspectResources(m,process.env);writePrivate(dir,'resources-inventory.private.json',result);console.log(JSON.stringify({status:result.status,requests:result.requests,workerExists:result.worker.exists}));process.exit(0);}
if(command==='preflight'){
 const evidence=preflightPath?read(preflightPath):{};
 const result=preflight(m,evidence);writePrivate(dir,'preflight.private.json',result);console.log(JSON.stringify(result,null,2));process.exit(result.status==='READY'?0:2);
}
if(command==='report'){
 const summary=existsSync(resolve(dir,'observer.private.json'))?read(resolve(dir,'observer.private.json')):null;
 const traffic=existsSync(resolve(dir,'traffic-summary.private.json'))?read(resolve(dir,'traffic-summary.private.json')):null;
 writeFileSync(resolve(dir,'report.private.html'),renderReport(m,summary,traffic),{mode:0o600});console.log('Report saved inside the private run directory.');process.exit(0);
}
const pf=read(preflightPath),approval=read(approvalPath);
if(!Number.isFinite(Date.parse(pf.observedAt))||Date.now()-Date.parse(pf.observedAt)>=3600000||Date.parse(pf.observedAt)>Date.now())throw Error('FRESH_INITIAL_PREFLIGHT_REQUIRED');
admit(m,pf,approval,command);
const cleanupDrainMs=m.cleanupReserveRequests*15000;
if(['setup','campaign','traffic'].includes(command)&&Date.parse(approval.expiresAt)-Date.now()<cleanupDrainMs+(command==='traffic'?m.durationSeconds:m.observeSeconds)*1000)throw Error('SCOPE_MUST_COVER_WORK_AND_CLEANUP');
const requiredPhases=command==='setup'?['setup','cleanup']:command==='campaign'?['campaign','observe','traffic','cleanup',...(m.faults.length?['faults']:[])]:[command];for(const phase of requiredPhases)admit(m,pf,approval,phase);
const actualRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(actualRevision!==m.revision)throw Error('CHECKOUT_REVISION_MISMATCH');
execFileSync('git',['diff','--quiet']);execFileSync('git',['diff','--cached','--quiet']);
// A reviewed local adapter supplies real mailbox/challenge integrations, current
// all-stage accounting and optional provider/queue controls. No auth shortcut.
const adapterPath=process.env.CAMPAIGN_ADAPTER;
if(!adapterPath)throw Error('REVIEWED_AUTH_ACCOUNTING_ADAPTER_REQUIRED');
const adapter=await import(pathToFileURL(resolve(adapterPath)).href);adapter.configure?.(m,dir);
const adminCookie=process.env.CAMPAIGN_ADMIN_COOKIE;
if(!/^dn_session=/.test(adminCookie??''))throw Error('REAL_ADMIN_SESSION_REQUIRED');
const unlock=lockRun(dir),client=new ApplicationClient(m,dir);
let child=null,restore=null;
const opts={emailDomain:process.env.CAMPAIGN_EMAIL_DOMAIN,mailbox:adapter.mailbox,challenge:adapter.challenge,authorizeAccount:adapter.authorizeAccount,browserEvidence:adapter.browserEvidence,adminCookie};
try{
 if(command==='setup'){const checks=await adapter.preflight?.({manifest:m});if(checks?.ready!==true)throw Error('REAL_SETUP_INTEGRATIONS_NOT_VERIFIED');}
 journal(dir,{category:'phase-start',phase:command,revision:m.revision,manifestHash:digest(m)});
 if(command==='setup')await setup(m,client,dir,opts);
 else if(command==='resume')await reconcileSetup(m,client,dir);
 else if(command==='cleanup')await archive(m,client,dir,opts);
 else{
  const registry=readRegistry(dir);
  if(command==='plan'){
   const from=registry.users.flatMap(u=>u.feeds.map(f=>f.config?.createdAt??f.createdAt)).sort()[0],until=new Date(Date.now()+m.observeSeconds*1000).toISOString();
   const body={feedIds:registry.users.flatMap(u=>u.feeds.map(f=>f.id)),from,until};
   const result=await client.request(`/api/admin/agentops/campaigns/${m.runId}/plan`,{method:'POST',cookie:adminCookie,body,category:'opportunity-plan'});
   writePrivate(dir,'plan.private.json',{...result.value,campaignStartedAt:registry.createdAt});
  }else{
   if(m.profile==='agentops'&&!registry.browserRuns?.length)throw Error('EXACT_OWNED_BROWSER_AGENT_RUNS_REQUIRED');
   const plan=read(resolve(dir,'plan.private.json')),observer=new CampaignObservation(m,plan);
   if(existsSync(resolve(dir,'observer.private.json')))observer.restore(read(resolve(dir,'observer.private.json')));
   if(plan.runId!==m.runId||!plan.opportunities.length)throw Error('NONEMPTY_BOUND_PLAN_REQUIRED');
   let lastResourceAt=0,lastResources=null;
   const observe=async()=>{
    if(Date.now()-lastResourceAt>=300000){const target=read(resolve(dir,'resources.private.json'));const resources=await observeResources(m,target,dir,process.env,plan.campaignStartedAt??plan.plannedAt,new Date().toISOString());writePrivate(dir,'resource-window.private.json',resources);lastResourceAt=Date.now();lastResources=resources;}

    const costs=await adapter.costs({manifest:m,registry,client,adminCookie,dir});
    const result=await observeOnce(m,client,dir,registry,observer,adminCookie,costs);
    if(lastResources){const r=lastResources;Object.assign(result.summary,{workerCpuMs:r.worker?.cpuTimeUs===undefined?null:r.worker.cpuTimeUs/1000,databaseRowsRead:r.database?.rowsRead??null,databaseRowsWritten:r.database?.rowsWritten??null,queueBacklog:r.queues.every(q=>q.backlog!==null)?r.queues.reduce((n,q)=>n+q.backlog,0):null});}
    if(lastResources){for(const q of lastResources.queues){if(q.backlog>m.stop.maxBacklog)result.stop.push('QUEUE_BACKLOG_LIMIT');if(q.backlog>0&&q.oldestPendingMs===null)result.stop.push('QUEUE_AGE_UNOBSERVABLE');if(q.oldestPendingMs>m.stop.oldestPendingMs)result.stop.push('QUEUE_PENDING_AGE_LIMIT');}}
    if(process.env.CAMPAIGN_EXPORT_METRICS==='true'){admit(m,pf,approval,'telemetry');reserveControlPlane(m,dir,'grafana-write');await exportMetrics(m,result.summary,process.env);}
    return result;
   };
   const startTraffic=()=>{
    admit(m,pf,approval,'traffic');
    // k6 receives only the run's private registry, never admin credentials.
    const inherited=['PATH','Path','SYSTEMROOT','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','CI','NO_COLOR'];
    const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>inherited.includes(k)));
    const trafficRegistry={runId:registry.runId,origin:registry.origin,users:registry.users.map(u=>({id:u.id,username:u.username,cookie:u.cookie,feeds:u.feeds.map(f=>({id:f.id,config:{slug:f.config.slug,publicFeedEnabled:f.config.publicFeedEnabled}}))}))};
    writePrivate(dir,'traffic-registry.private.json',trafficRegistry);
    writePrivate(dir,'k6.config.private.json',{});
    child=spawn('k6',['run','--config',resolve(dir,'k6.config.private.json'),'--traces-output','none','--include-system-env-vars=false','-e','CAMPAIGN_MANIFEST='+resolve(manifestPath),'-e','CAMPAIGN_REGISTRY='+resolve(dir,'traffic-registry.private.json'),'--summary-export',resolve(dir,'traffic-summary.private.json'),'evaluation/performance-reliability/real/users.k6.js'],{env:{...env,CAMPAIGN_MANIFEST:resolve(manifestPath),CAMPAIGN_REGISTRY:resolve(dir,'traffic-registry.private.json'),K6_NO_USAGE_REPORT:'true'},stdio:['ignore','pipe','pipe']});
    // Avoid raw k6 logs containing URLs or errors reaching CI. Only exit status
    // and its bounded JSON summary are retained. Buffers are always drained.
    child.stdout.resume();child.stderr.resume();return new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('K6_START_FAILED')));child.once('exit',code=>code===0?resolve():reject(Error('K6_FAILED_'+code)));});
   };
   if(command==='traffic')await startTraffic();
   else if(command==='observe'){const r=await observe();if(r.stop.length)throw Error('SAFETY_STOP_'+r.stop.join('_'));}
   else if(command==='campaign'){
    admit(m,pf,approval,'observe');
    const initial=await observe();if(initial.stop.length)throw Error('INITIAL_SAFETY_STOP_'+initial.stop.join('_'));
    let traffic=Promise.resolve(),trafficStarted=false,trafficError;
    const firstDue=Math.min(...plan.opportunities.map(o=>Date.parse(o.window.scheduledFor??o.window.end)));
    const trafficAt=Math.max(Date.now(),firstDue-30000);
    const started=Date.now(),doneFaults=new Set();
    if(trafficAt+m.durationSeconds*1000>started+m.observeSeconds*1000)throw Error('OBSERVATION_MUST_COVER_TRAFFIC_AND_DRAIN');
    while(Date.now()-started<m.observeSeconds*1000){
     if(Date.parse(approval.expiresAt)-Date.now()<=cleanupDrainMs+m.pollSeconds*1000)throw Error('SCOPE_ENDING_ARCHIVE_BEFORE_EXPIRY');
     admit(m,pf,approval,'campaign');
     if(!trafficStarted&&Date.now()>=trafficAt){traffic=startTraffic();trafficStarted=true;traffic.catch(e=>{trafficError=e;});}
     if(trafficError)throw trafficError;
     for(const [i,fault]of m.faults.entries())if(!doneFaults.has(i)&&(Date.now()-started)/1000>=fault.afterSeconds){
      admit(m,pf,approval,'faults');
      if(!adapter.fault)throw Error('REAL_FAULT_DRIVER_UNAVAILABLE');
      // Adapter must journal the saved control state before mutation and return
      // an idempotent restore function. A failure aborts; never auto-retry.
      restore=await adapter.fault({manifest:m,fault,registry,client,adminCookie,dir});
      if(typeof restore!=='function')throw Error('FAULT_ROLLBACK_NOT_ESTABLISHED');
      for(let elapsed=0;elapsed<fault.seconds;elapsed+=Math.min(m.pollSeconds,30)){admit(m,pf,approval,'faults');const during=await observe();if(during.stop.length)throw Error('FAULT_SAFETY_STOP_'+during.stop.join('_'));await new Promise(r=>setTimeout(r,Math.min(30,m.pollSeconds,fault.seconds-elapsed)*1000));}await restore();restore=null;doneFaults.add(i);
     }
     const result=await observe();if(result.stop.length)throw Error('SAFETY_STOP_'+result.stop.join('_'));
     await new Promise(r=>setTimeout(r,m.pollSeconds*1000));
    }
    if(!trafficStarted)throw Error('TRAFFIC_NEVER_REACHED_DUE_WINDOW');await traffic;
   }else throw Error('UNKNOWN_PHASE');
  }
 }
 if(command==='campaign'){admit(m,pf,approval,'cleanup');await archive(m,client,dir,opts);}
 journal(dir,{category:'phase-completed',phase:command});
}catch(e){
 child?.kill();if(restore){try{await restore();restore=null}catch{journal(dir,{category:'URGENT_MANUAL_ROLLBACK_REQUIRED'});}}journal(dir,{category:'phase-stopped',phase:command,reason:String(e.message).replace(/[^A-Z0-9_]/gi,'_').slice(0,160)});
 // Stop new production via ordinary owned interfaces; do not delete holds or
 // resend unknown operations. Existing in-flight work remains accounted for.
 if(command==='campaign'||command==='setup')try{await archive(m,client,dir,opts)}catch{journal(dir,{category:'cleanup-required',reason:'AUTOMATIC_ARCHIVE_INCOMPLETE'});}
 throw Error('CAMPAIGN_STOPPED_CHECK_PRIVATE_JOURNAL');
}finally{if(restore)try{await restore()}catch{journal(dir,{category:'URGENT_MANUAL_ROLLBACK_REQUIRED'});}unlock();}
