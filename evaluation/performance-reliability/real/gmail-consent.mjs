/** Supervised local consent only. Never deploy this listener or print tokens. */
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,existsSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {desktopClient,consentUrl,callbackCode,GMAIL_READONLY,gmailAlias} from './gmail-oauth.mjs';
const dir=resolve(process.argv[2]??''),email=String(process.argv[3]??'').trim().toLowerCase();
if(!dir.endsWith('pilotnov01')||!email)throw Error('EXPLICIT_QA_DIRECTORY_AND_EMAIL_REQUIRED');
gmailAlias(email,'pilotnov01',0);
const client=JSON.parse(readFileSync(resolve(dir,'gmail-client.json'),'utf8').replace(/^\uFEFF/,'')),c=desktopClient(client);
if(existsSync(resolve(dir,'gmail-token.json')))throw Error('EXISTING_GMAIL_TOKEN_REVIEW_BEFORE_RECONSENT');
const state=randomBytes(36).toString('base64url'),verifier=randomBytes(48).toString('base64url');
function save(name,value){const p=resolve(dir,name);writeFileSync(p,JSON.stringify(value,null,2)+'\n',{mode:0o600});const fd=openSync(p,'r+');try{fsyncSync(fd)}finally{closeSync(fd)}}
let redirect,consumed=false,timer;
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'||req.headers.host!==new URL(redirect).host){res.writeHead(404).end('Not found');return}
 let code;try{code=callbackCode(req.url,state)}catch{res.writeHead(400).end('Authorization callback rejected.');return}
 if(consumed){res.writeHead(409).end('Authorization is already being completed.');return}consumed=true;
 try{
  const response=await fetch(c.token_uri,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('GOOGLE_TOKEN_EXCHANGE_'+response.status);
  const t=await response.json();const scopes=String(t.scope??'').split(/\s+/).filter(Boolean);
  if(!t.access_token||!t.refresh_token||t.token_type?.toLowerCase()!=='bearer'||scopes.length!==1||scopes[0]!==GMAIL_READONLY||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw Error('READONLY_OFFLINE_TOKEN_NOT_CONFIRMED');
  const profile=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{authorization:'Bearer '+t.access_token},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!profile.ok)throw Error('GMAIL_PROFILE_'+profile.status);
  const identity=await profile.json();if(identity.emailAddress?.toLowerCase()!==email)throw Error('WRONG_QA_MAILBOX');
  save('gmail-token.json',{access_token:t.access_token,refresh_token:t.refresh_token,token_type:'Bearer',scope:GMAIL_READONLY,expires_at:Date.now()+t.expires_in*1000,email,createdAt:new Date().toISOString()});
  save('gmail-authorization-status.json',{status:'VERIFIED',at:new Date().toISOString(),email,scope:GMAIL_READONLY,refreshTokenStored:true,mailboxMessagesRead:0,paidCalls:0});
  res.writeHead(200).end('Gmail read-only access is connected. You can close this tab.');console.log(JSON.stringify({status:'GMAIL_READONLY_VERIFIED',email,tokensPrinted:false}));
 }catch(e){save('gmail-authorization-status.json',{status:'FAILED',at:new Date().toISOString(),error:e instanceof Error?e.message:'AUTHORIZATION_FAILED'});res.writeHead(400).end('Authorization could not be completed. No token was saved.');console.error(e instanceof Error?e.message:'AUTHORIZATION_FAILED');process.exitCode=1}
 finally{clearTimeout(timer);server.close()}
});
server.listen(0,'127.0.0.1',()=>{
 redirect='http://127.0.0.1:'+server.address().port+'/oauth2/callback';
 writeFileSync(resolve(dir,'gmail-consent-url.txt'),consentUrl(client,redirect,state,verifier),{mode:0o600});
 save('gmail-authorization-status.json',{status:'AWAITING_BROWSER_CONSENT',at:new Date().toISOString(),email,scope:GMAIL_READONLY,loopbackOnly:true,expiresAt:new Date(Date.now()+600000).toISOString()});
 console.log(JSON.stringify({status:'CONSENT_READY',email,loopbackOnly:true,expiresInMinutes:10}));
 timer=setTimeout(()=>{save('gmail-authorization-status.json',{status:'EXPIRED',at:new Date().toISOString()});server.close();process.exitCode=1},600000);
});
