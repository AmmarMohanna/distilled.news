import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verificationToken,GmailMailbox} from '../evaluation/performance-reliability/real/gmail-mailbox.mjs';
const origin='https://distilled-news-staging-campaign-pilot.distillednews-platform.workers.dev',email='qa.inbox+pilotnov01-u0@gmail.com',since='2026-11-01T20:00:00.000Z';
const message=(text,extra={})=>({id:'abc123',internalDate:String(Date.parse(since)+1000),payload:{mimeType:'text/plain',headers:[{name:'To',value:email}],body:{data:Buffer.from(text).toString('base64url')}},...extra});
const options={email,origin,registeredAt:since};
test('verification reader accepts actual localized links without depending on subject language',()=>{
 const token='offline-verification-token';const m=message(`Verify: ${origin}/verify-email?token=${token}&lang=ar`);assert.equal(verificationToken(m,options),token);
 const multipart=message('',{payload:{headers:[{name:'To',value:`QA <${email}>`}],parts:[{mimeType:'text/html',body:{data:Buffer.from(`<a href="${origin}/verify-email?token=${token}&amp;lang=fr">Verify</a>`).toString('base64url')}}]}});assert.equal(verificationToken(multipart,options),token);
});
test('reader refuses wrong alias, stale mail, production links and password-reset links',()=>{
 const link=`${origin}/verify-email?token=offline-verification-token`;
 assert.equal(verificationToken(message(link),{...options,email:'qa.inbox+pilotnov01-u1@gmail.com'}),null);
 assert.equal(verificationToken(message(link,{internalDate:String(Date.parse(since)-1)}),options),null);
 assert.equal(verificationToken(message('https://distilled.news/verify-email?token=offline-verification-token'),options),null);
 assert.equal(verificationToken(message(`${origin}/reset-password?token=offline-verification-token`),options),null);
});
test('reader rejects ambiguous tokens and oversized payloads rather than guessing',()=>{
 assert.throws(()=>verificationToken(message(`${origin}/verify-email?token=offline-verification-token ${origin}/verify-email?token=different-verification-token`),options),/AMBIGUOUS/);
 assert.throws(()=>verificationToken(message('a'.repeat(1100000)),options),/LIMIT/);
});
test('mailbox integration is available for bounded implementation',()=>{assert.equal(typeof GmailMailbox,'function')});

import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
function fixtureDirectory(){const root=resolve(tmpdir()),dir=mkdtempSync(resolve(root,'distilled-gmail-'));assert.ok(dir.startsWith(root+sep));return dir}
function seed(dir,expiresAt){writeFileSync(resolve(dir,'gmail-client.json'),JSON.stringify({installed:{client_id:'offline-id',client_secret:'offline-secret',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'}}));writeFileSync(resolve(dir,'gmail-token.json'),JSON.stringify({email:'qa.inbox@gmail.com',scope:'https://www.googleapis.com/auth/gmail.readonly',access_token:'offline-access',refresh_token:'offline-refresh',expires_at:expiresAt}))}
test('mailbox queries only the exact alias/time and reads a bounded matching message',async()=>{
 const dir=fixtureDirectory(),now=Date.parse(since)+10000,requests=[];try{
  seed(dir,now+3600000);const mailbox=new GmailMailbox({directory:dir,email:'qa.inbox@gmail.com',now:()=>now,fetcher:async(url,options)=>{requests.push({url,options});return Response.json(url.includes('/messages?')?{messages:[{id:'abc123'}]}:message(`${origin}/verify-email?token=offline-verification-token`))}});
  const found=await mailbox.find({email,runId:'pilotnov01',registeredAt:since,origin});assert.equal(found.token,'offline-verification-token');assert.equal(requests.length,2);const q=new URL(requests[0].url);assert.equal(q.searchParams.get('q'),'to:'+email+' after:'+Math.floor(Date.parse(since)/1000));assert.equal(q.searchParams.get('maxResults'),'10');assert.ok(requests.every(r=>r.options.redirect==='error'));
  await assert.rejects(mailbox.find({email:'someone@gmail.com',runId:'pilotnov01',registeredAt:since,origin}),/SCOPE_DENIED/);assert.equal(requests.length,2);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('expired access refreshes through OAuth without broadening scope or sending email',async()=>{
 const dir=fixtureDirectory(),now=Date.parse(since)+10000,requests=[];try{
  seed(dir,now-1);const mailbox=new GmailMailbox({directory:dir,email:'qa.inbox@gmail.com',now:()=>now,fetcher:async(url,options)=>{requests.push({url,method:options.method??'GET'});return Response.json(url==='https://oauth2.googleapis.com/token'?{access_token:'offline-new-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.readonly'}:{messages:[]})}});
  assert.equal(await mailbox.find({email,runId:'pilotnov01',registeredAt:since,origin}),null);assert.equal(requests.length,2);assert.equal(requests[0].url,'https://oauth2.googleapis.com/token');assert.ok(requests.every(r=>!r.url.includes('/send')));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('an observed empty Gmail search with HTTP 204 returns no token and never verifies an account',async()=>{
 const dir=fixtureDirectory(),now=Date.parse(since)+10000;try{
  seed(dir,now+3600000);const mailbox=new GmailMailbox({directory:dir,email:'qa.inbox@gmail.com',now:()=>now,fetcher:async()=>new Response(null,{status:204})});
  assert.equal(await mailbox.find({email,runId:'pilotnov01',registeredAt:since,origin}),null);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
