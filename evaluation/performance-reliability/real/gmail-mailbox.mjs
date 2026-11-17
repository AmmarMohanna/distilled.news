import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {GMAIL_READONLY,desktopClient,gmailAlias} from './gmail-oauth.mjs';
import {writePrivate} from './client.mjs';
const QA_ORIGIN=/^https:\/\/distilled-news-staging-campaign-[a-z0-9-]+\.distillednews-platform\.workers\.dev$/;
function textParts(payload){
 let bytes=0,count=0;const parts=[];
 const visit=(p,depth)=>{if(!p)return;if(depth>8||++count>50)throw Error('MAIL_PAYLOAD_LIMIT');if(['text/plain','text/html'].includes(p.mimeType)&&p.body?.data){if(p.body.data.length>1500000)throw Error('MAIL_PAYLOAD_LIMIT');const data=Buffer.from(p.body.data,'base64url');if((bytes+=data.length)>1048576)throw Error('MAIL_PAYLOAD_LIMIT');parts.push(data.toString('utf8'))}for(const child of p.parts??[])visit(child,depth+1)};visit(payload,0);return parts.join('\n').replace(/&amp;/g,'&');
}
export function verificationToken(message,{email,origin,registeredAt}){
 if(!QA_ORIGIN.test(origin)||!Number.isFinite(Date.parse(registeredAt)))throw Error('ISOLATED_MAIL_CONTEXT_REQUIRED');
 if(!Number.isFinite(Number(message.internalDate))||Number(message.internalDate)<Date.parse(registeredAt))return null;
 const recipients=(message.payload?.headers??[]).filter(h=>['to','delivered-to'].includes(h.name?.toLowerCase())).flatMap(h=>String(h.value).toLowerCase().match(/[a-z0-9.+_-]+@gmail\.com/g)??[]);
 if(!recipients.includes(email.toLowerCase()))return null;
 const found=new Set();for(const link of textParts(message.payload).match(/https?:\/\/[^\s<>"']+/g)??[]){let u;try{u=new URL(link)}catch{continue}if(u.origin!==origin||u.pathname!=='/verify-email'||u.username||u.password||u.hash||u.searchParams.getAll('token').length!==1)continue;const token=u.searchParams.get('token');if(token&&/^[A-Za-z0-9_-]{20,256}$/.test(token))found.add(token)}
 if(found.size>1)throw Error('AMBIGUOUS_VERIFICATION_MAIL');return [...found][0]??null;
}
/** Read-only Gmail REST client. No message content/tokens are logged or exported. */
export class GmailMailbox {
 constructor({directory,email,fetcher=fetch,now=Date.now,onRequest=()=>{}}){this.dir=resolve(directory);this.email=email.toLowerCase();this.fetcher=fetcher;this.now=now;this.onRequest=onRequest;this.client=desktopClient(JSON.parse(readFileSync(resolve(this.dir,'gmail-client.json'),'utf8').replace(/^\uFEFF/,'')));gmailAlias(this.email,'mailcheck01',0)}
 async accessToken(){
  let t=JSON.parse(readFileSync(resolve(this.dir,'gmail-token.json'),'utf8'));
  if(t.email!==this.email||t.scope!==GMAIL_READONLY||!t.refresh_token||!t.access_token)throw Error('READONLY_QA_TOKEN_REQUIRED');
  if(t.expires_at>this.now()+60000)return t.access_token;
  this.onRequest('gmail-refresh');const r=await this.fetcher(this.client.token_uri,{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.client.client_id,client_secret:this.client.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('GMAIL_REFRESH_'+r.status);const next=await r.json();
  if(!next.access_token||next.scope&&next.scope!==GMAIL_READONLY||!Number.isFinite(next.expires_in)||next.expires_in<=0)throw Error('READONLY_REFRESH_NOT_CONFIRMED');
  t={...t,access_token:next.access_token,refresh_token:next.refresh_token??t.refresh_token,expires_at:this.now()+next.expires_in*1000};writePrivate(this.dir,'gmail-token.json',t);return t.access_token;
 }
 async get(path,kind){
  const token=await this.accessToken();this.onRequest(kind);const r=await this.fetcher('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('GMAIL_READ_'+r.status);if(r.status===204&&kind==='gmail-list')return {messages:[]};const text=await r.text();if(!text.trim())throw Error('MAIL_RESPONSE_EMPTY');if(Buffer.byteLength(text)>1500000)throw Error('MAIL_RESPONSE_LIMIT');return JSON.parse(text);
 }
 async find({email,runId,registeredAt,origin}){
  if(!Array.from({length:20},(_,slot)=>gmailAlias(this.email,runId,slot)).includes(email)||!QA_ORIGIN.test(origin)||!Number.isFinite(Date.parse(registeredAt))||Date.parse(registeredAt)>this.now()||this.now()-Date.parse(registeredAt)>14400000)throw Error('CAMPAIGN_MAIL_SCOPE_DENIED');
  const query=new URLSearchParams({q:'to:'+email+' after:'+Math.floor(Date.parse(registeredAt)/1000),maxResults:'10',includeSpamTrash:'true',fields:'messages/id,nextPageToken'});
  const list=await this.get('messages?'+query,'gmail-list');if(list.nextPageToken||list.messages?.length>10)throw Error('MAIL_MATCH_LIMIT');
  const matches=[];for(const row of list.messages??[]){if(!/^[a-zA-Z0-9_-]{1,64}$/.test(row.id))throw Error('MAIL_ID_INVALID');const message=await this.get('messages/'+row.id+'?format=full&fields=id,internalDate,payload','gmail-message');const token=verificationToken(message,{email,origin,registeredAt});if(token)matches.push({token,receipt:{receivedAt:new Date(Number(message.internalDate)).toISOString(),messageHash:createHash('sha256').update(JSON.stringify(message)).digest('hex'),runId}})}
  if(new Set(matches.map(m=>m.token)).size>1)throw Error('AMBIGUOUS_VERIFICATION_MAIL');return matches[0]??null;
 }
}
