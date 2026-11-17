import {reserveControlPlane} from './control-budget.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {writePrivate,journal} from './client.mjs';
/** Real control-plane faults; caller must pass exact approval and isolation. */
export async function fault({manifest:m,fault:f,client,adminCookie,dir},env=process.env,fetcher=fetch){
 if(!/^https:\/\/distilled-news-staging-campaign-[a-z0-9-]+\.distillednews-platform\.workers\.dev$/.test(m.origin))throw Error('DEDICATED_FAULT_TARGET_REQUIRED');
 const target=JSON.parse(readFileSync(resolve(dir,'resources.private.json'),'utf8'));
 const worker=new URL(m.origin).hostname.split('.')[0];
 if(target.worker!==worker||target.runId!==m.runId||target.isolated!==true||!/^[a-f0-9]{32}$/.test(target.accountId))throw Error('FAULT_RESOURCE_BINDING');
 const call=async(path,method='GET',body)=>{
  reserveControlPlane(m,dir,'fault-control');
  if(!env.CAMPAIGN_CLOUDFLARE_TOKEN)throw Error('CLOUDFLARE_FAULT_PERMISSION_REQUIRED');
  const r=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+target.accountId+path,{method,redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.CAMPAIGN_CLOUDFLARE_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error('CLOUDFLARE_CONTROL_OUTCOME_REQUIRES_RECONCILIATION');const data=await r.json();if(data.success!==true)throw Error('CLOUDFLARE_CONTROL_REJECTED');return data.result;
 };
 const record=state=>writePrivate(dir,'fault-rollback.private.json',{runId:m.runId,kind:f.kind,at:new Date().toISOString(),state});
 const done=()=>journal(dir,{category:'fault-restored',kind:f.kind});
 if(f.kind==='provider-auth-rejection'){
  if(!env.CAMPAIGN_ORIGINAL_OPENROUTER_KEY)throw Error('ORIGINAL_PROVIDER_SECRET_REQUIRED_FOR_ROLLBACK');
  record({worker,secret:'OPENROUTER_API_KEY',restoreFrom:'CAMPAIGN_ORIGINAL_OPENROUTER_KEY'});
  const restore=async()=>{await call('/workers/scripts/'+worker+'/secrets','PUT',{name:'OPENROUTER_API_KEY',text:env.CAMPAIGN_ORIGINAL_OPENROUTER_KEY,type:'secret_text'});done();};
  try{await call('/workers/scripts/'+worker+'/secrets','PUT',{name:'OPENROUTER_API_KEY',text:'campaign-intentionally-invalid',type:'secret_text'});}catch(e){await restore();throw e;}return restore;
 }
 if(f.kind==='queue-contention'){
  if(!/^[a-f0-9]{32}$/.test(target.queueId??'')||!/^[a-f0-9]{32}$/.test(target.consumerId??''))throw Error('EXACT_ISOLATED_QUEUE_REQUIRED');
  const path='/queues/'+target.queueId+'/consumers/'+target.consumerId,old=await call(path);
  if(old.settings?.max_concurrency===1)throw Error('QUEUE_ALREADY_AT_TARGET_NO_FAULT_APPLIED');
  if(old.type!=='worker'||old.script_name!==worker)throw Error('QUEUE_OWNER_MISMATCH');
  const saved={script_name:old.script_name,type:old.type,...(old.dead_letter_queue?{dead_letter_queue:old.dead_letter_queue}:{}),settings:old.settings};record({queueId:target.queueId,consumerId:target.consumerId,body:saved});
  const restore=async()=>{await call(path,'PUT',saved);done();};
  try{await call(path,'PUT',{...saved,settings:{...old.settings,max_concurrency:1}});}catch(e){await restore();throw e;}return restore;
 }
 const plan=JSON.parse(readFileSync(resolve(dir,'plan.private.json'),'utf8'));
 const original=plan.opportunities.find(o=>Date.parse(o.window.end)<=Date.now());if(!original)throw Error('ORIGINAL_DUE_OPPORTUNITY_REQUIRED');
 const endpoint='/api/admin/agentops/campaigns/'+m.runId+'/';
 if(f.kind==='duplicate-delivery'){
  record({feedId:original.feedId,originalId:original.id,mode:'NO_REVERSIBLE_QUEUE_MUTATION'});
  await client.request(endpoint+'duplicate',{method:'POST',cookie:adminCookie,body:{feedId:original.feedId,window:original.window},category:'controlled-duplicate'});return async()=>done();
 }
 if(f.kind==='after-result-interruption'){
  record({feedId:original.feedId,until:null});
  const restore=async()=>{await client.request(endpoint+'interrupt',{method:'POST',cookie:adminCookie,body:{feedId:original.feedId,until:null},category:'fault-restore'});done();};
  try{await client.request(endpoint+'interrupt',{method:'POST',cookie:adminCookie,body:{feedId:original.feedId,until:new Date(Date.now()+f.seconds*1000).toISOString()},category:'controlled-interruption'});}catch(e){await restore();throw e;}return restore;
 }
 throw Error('UNSUPPORTED_FAULT');
}
