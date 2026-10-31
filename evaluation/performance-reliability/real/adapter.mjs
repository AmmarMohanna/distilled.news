import {reserveControlPlane} from './control-budget.mjs';
let active;export function configure(manifest,dir){active={manifest,dir};}
/** Connect only pre-existing, explicitly authorized private QA interfaces.
 * These interfaces supply real mailbox/challenge results and ledger evidence;
 * the adapter does not sign sessions, read auth-token SQL, or invent spend. */
import {reconcileAccounting} from './accounting.mjs';
export async function bridge(name,body,env=process.env,fetcher=fetch){
 if(!active)throw Error('ADAPTER_RUN_BINDING_REQUIRED');reserveControlPlane(active.manifest,active.dir,'private-qa-api');
 const url=new URL(env['CAMPAIGN_'+name+'_URL']);
 const allow=(env.CAMPAIGN_PRIVATE_API_ORIGINS??'').split(',');
 if(url.protocol!=='https:'||url.username||url.password||url.search||!allow.includes(url.origin)||!env.CAMPAIGN_PRIVATE_API_TOKEN)throw Error('AUTHORIZED_PRIVATE_QA_API_REQUIRED');
 const response=await fetcher(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+env.CAMPAIGN_PRIVATE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!response.ok)throw Error('PRIVATE_QA_API_UNAVAILABLE');
 const text=await response.text();if(Buffer.byteLength(text)>1000000)throw Error('PRIVATE_QA_RESPONSE_LIMIT');try{return JSON.parse(text)}catch{throw Error('PRIVATE_QA_JSON_INVALID')}
}
export async function mailbox({email,runId}){const r=await bridge('MAILBOX',{email,runId,purpose:'email_verification'});if(typeof r.token!=='string'||r.email!==email||r.runId!==runId)throw Error('MAILBOX_BINDING');return r.token;}
export async function challenge(user,action){const r=await bridge('CHALLENGE',{email:user.email,action});if(typeof r.token!=='string'||r.email!==user.email||r.action!==action)throw Error('CHALLENGE_BINDING');return r.token;}
export async function costs({manifest,registry}){const r=await bridge('ACCOUNTING',{runId:manifest.runId,accountIds:registry.users.map(u=>u.id).filter(Boolean)});if(r.runId!==manifest.runId)throw Error('ACCOUNTING_RUN_BINDING');return reconcileAccounting(r);}
export {fault} from './faults.mjs';

export async function authorizeAccount({manifest,user}){return bridge('ACCOUNT_ADMISSION',{runId:manifest.runId,manifestHash:(await import('./manifest.mjs')).digest(manifest),accountId:user.id,maximumUsd:(manifest.budget.totalUsd-manifest.budget.cloudUsd-manifest.budget.drainUsd)/manifest.users});}
export async function preflight({manifest}){return bridge('PREFLIGHT',{runId:manifest.runId,origin:manifest.origin,checkOnly:true});}

export async function browserEvidence({manifest,user}){return bridge('BROWSER_EVIDENCE',{runId:manifest.runId,accountId:user.id,readOnly:true});}
