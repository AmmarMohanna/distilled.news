import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {bounded,writePrivate,readRegistry,journal} from './client.mjs';

export const feedId=(run,user,feed)=>`qa_${run}_u${user}_f${feed}`;
const assert=(ok,code)=>{if(!ok)throw Error(code);};
/** Token retrieval is a real, isolated mailbox integration supplied by the
 * operator. Never read auth_tokens, sign cookies, or use /api/auth/setup here. */
export async function setup(m,client,dir,{emailDomain,mailbox,challenge,authorizeAccount,browserEvidence,adminCookie}){
 assert(emailDomain&&/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(emailDomain),'AUTHORIZED_MAIL_DOMAIN_REQUIRED');
 assert(typeof mailbox==='function'&&typeof challenge==='function'&&typeof authorizeAccount==='function'&&adminCookie,'AUTHENTICATION_INTEGRATIONS_REQUIRED');
 const path=resolve(dir,'registry.private.json');
 if(existsSync(path))throw Error('REGISTRY_EXISTS_USE_RESUME_NOT_RECREATE');
 const registry={schemaVersion:'distilled-real-registry.v1',runId:m.runId,origin:m.origin,createdAt:new Date().toISOString(),users:Array.from({length:m.users},(_,i)=>({slot:i,username:`qa${m.runId}u${i}`,email:`qa-${m.runId}-u${i}@${emailDomain}`,password:randomBytes(24).toString('base64url'),state:'NOT_SENT',feeds:[]}))};
 const save=()=>writePrivate(dir,'registry.private.json',registry);save();
 const results=await bounded(registry.users,m.setupConcurrency,async u=>{
  // Journal before every mutation. An interruption is reconciled through owned
  // reads; a SENT/UNKNOWN operation is never blindly replayed.
  u.state='REGISTER_SENT';save();
  await client.request('/api/auth/register',{method:'POST',body:{email:u.email,username:u.username,password:u.password,language:u.slot%2?'ar':'en',turnstileToken:await challenge(u,'register')},category:'register'});
  u.state='AWAITING_EMAIL';save();
  const token=await mailbox({email:u.email,runId:m.runId});assert(typeof token==='string'&&token.length>0,'MAILBOX_TOKEN_REQUIRED');
  const verified=await client.request('/api/auth/verify-email',{method:'POST',body:{token},category:'verify-email'});
  assert(verified.value?.account?.username===u.username&&verified.cookie,'VERIFIED_ACCOUNT_IDENTITY');u.id=verified.value.account.id;u.cookie=verified.cookie;u.state='VERIFIED';save();
  await login(client,u,challenge);save();
  const session=await client.request('/api/auth/session',{cookie:u.cookie});assert(session.value?.authenticated===true&&session.value.account.id===u.id,'SESSION_IDENTITY');
  const initial=await client.request('/api/me/briefings',{cookie:u.cookie});assert(initial.value.briefings.length===0,'UNEXPECTED_PREEXISTING_ACCOUNT_DATA');
  const admission=await authorizeAccount({manifest:m,user:u});
  assert(admission?.runId===m.runId&&admission.accountId===u.id&&admission.authoritative===true&&admission.maximumUsd<=(m.budget.totalUsd-m.budget.cloudUsd-m.budget.drainUsd)/m.users&&admission.maximumUsd>0&&admission.evidenceHash,'BOUNDED_ACCOUNT_ADMISSION_REQUIRED');u.admission=admission;save();
  for(let i=0;i<m.feeds.length;i++){
   const template=m.feeds[i],id=feedId(m.runId,u.slot,i);
   const entry={id,slot:i,ownerId:u.id,state:'CREATE_SENT'};u.feeds.push(entry);save();
   // Reserves observer/fault scope before any source assessment or paid work.
   await client.request(`/api/admin/agentops/campaigns/${m.runId}/register`,{method:'POST',cookie:adminCookie,body:{feedId:id,ownerId:u.id},category:'register-scope'});
   const response=await client.request('/api/me/feeds',{method:'POST',cookie:u.cookie,category:'create-feed',body:{id,title:`QA ${m.runId} ${u.slot}-${i}`,interestProfile:template.topic,sourceInputs:template.sources,publicFeedEnabled:template.public,updateIntervalMinutes:template.intervalMinutes,briefingTimeOfDay:template.dailyAt??'00:00',briefingTimezone:template.timezone,language:template.language}});
   assert(response.value?.briefing?.id===id&&response.value.briefing.ownerAccountId===u.id,'CREATED_FEED_OWNERSHIP');
   Object.assign(entry,{state:'CREATED',config:response.value.briefing,createdAt:new Date().toISOString()});save();
  }
  if(m.profile==='agentops'){
   assert(typeof browserEvidence==='function','REAL_BROWSER_EVIDENCE_INTERFACE_REQUIRED');
   for(const source of m.agentSources){const assessed=await client.request('/api/me/sources/assess',{method:'POST',cookie:u.cookie,body:{title:'QA agent campaign',description:m.feeds[0].topic,source},category:'real-agent-source-assessment'});writePrivate(dir,'agent-assessment-'+u.slot+'.private.json',assessed.value);}
   const evidence=await browserEvidence({manifest:m,user:u});assert(evidence?.runId===m.runId&&Array.isArray(evidence.runs)&&evidence.runs.length>0&&evidence.runs.every(r=>r.ownerId===u.id),'OWNED_AGENT_EXECUTION_EVIDENCE_REQUIRED');
   registry.browserRuns=[...(registry.browserRuns??[]),...evidence.runs.map(r=>({runId:r.runId,ownerId:r.ownerId}))];writePrivate(dir,'agent-history-'+u.slot+'.private.json',evidence);save();
  }
  u.state='READY';save();return {userSlot:u.slot,feeds:u.feeds.length};
 });
 journal(dir,{category:'setup-result',users:results.map((r,i)=>({slot:i,status:r.status,...(r.status==='rejected'?{reason:r.reason}:{})}))});
 if(results.some(r=>r.status==='rejected'))throw Error('SETUP_PARTIAL_STOP_AND_RECONCILE');
 return registry;
}
export async function login(client,user,challenge){
 const result=await client.request('/api/auth/login',{method:'POST',body:{email:user.email,password:user.password,turnstileToken:await challenge(user,'login')},category:'login'});
 assert(result.cookie&&result.value?.account?.id===user.id,'LOGIN_IDENTITY');user.cookie=result.cookie;return user;
}
/** Resolve only deterministic IDs by authenticated ownership reads. Does not
 * resend registration/source-assessment mutations or infer missing auth. */
export async function reconcileSetup(m,client,dir){
 const r=readRegistry(dir);assert(r.runId===m.runId&&r.origin===m.origin,'REGISTRY_BINDING');
 for(const u of r.users){
  if(!u.cookie||!u.id)continue;
  const session=await client.request('/api/auth/session',{cookie:u.cookie});assert(session.value?.account?.id===u.id,'RECONCILIATION_SESSION');
  const list=(await client.request('/api/me/briefings',{cookie:u.cookie})).value.briefings;
  for(const f of u.feeds){const match=list.find(x=>x.id===f.id);if(match){assert(match.ownerAccountId===u.id,'RECONCILIATION_OWNERSHIP');f.config=match;f.state='FOUND_AFTER_INTERRUPTION';}}
 }
 writePrivate(dir,'registry.private.json',r);return r;
}
export async function archive(m,client,dir,{adminCookie}){
 const r=readRegistry(dir);assert(r.runId===m.runId&&r.origin===m.origin,'REGISTRY_BINDING');
 for(const u of r.users){
  if(!u.id||!u.cookie||u.state==='ARCHIVED')continue;
  const session=await client.request('/api/auth/session',{cookie:u.cookie,category:'cleanup-read'});assert(session.value?.account?.id===u.id,'CLEANUP_SESSION');
  const owned=(await client.request('/api/me/briefings',{cookie:u.cookie,category:'cleanup-read'})).value.briefings;
  for(const f of u.feeds){
   assert(f.id===feedId(m.runId,u.slot,f.slot),'CLEANUP_NAMESPACE');const current=owned.find(x=>x.id===f.id);if(!current)continue;assert(current.ownerAccountId===u.id,'CLEANUP_OWNER');
   const sources=(await client.request('/api/me/sources?briefingId='+encodeURIComponent(f.id),{cookie:u.cookie,category:'cleanup-read'})).value.sources??[];
   await client.request('/api/me/briefings',{method:'POST',cookie:u.cookie,body:{...current,paused:true},category:'archive-feed'});
   for(const s of sources.filter(x=>x.briefingId===f.id&&x.enabled))await client.request('/api/me/sources',{method:'POST',cookie:u.cookie,body:{briefingId:f.id,sourceId:s.id,enabled:false},category:'disable-owned-source'});
   f.state='ARCHIVED';writePrivate(dir,'registry.private.json',r);
  }
  // Disabling the test account retains financial and source records. Never use
  // DELETE account/feed cascades to make performance cleanup look inexpensive.
  await client.request(`/api/admin/accounts/${encodeURIComponent(u.id)}`,{method:'PATCH',cookie:adminCookie,body:{disabled:true},category:'disable-owned-account'});
  u.state='ARCHIVED';writePrivate(dir,'registry.private.json',r);
 }
 journal(dir,{category:'cleanup',mode:'archive',historicalFinancialRecordsDeleted:false});return r;
}
