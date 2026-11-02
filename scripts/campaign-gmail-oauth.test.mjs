import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gmailAlias,consentUrl,callbackCode,GMAIL_READONLY} from '../evaluation/performance-reliability/real/gmail-oauth.mjs';
const client={installed:{client_id:'offline-client',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'}};
test('one Gmail inbox supplies distinct, run-bound QA aliases',()=>{
 assert.equal(gmailAlias('qa.inbox@gmail.com','pilotnov01',0),'qa.inbox+pilotnov01-u0@gmail.com');assert.notEqual(gmailAlias('qa.inbox@gmail.com','pilotnov01',0),gmailAlias('qa.inbox@gmail.com','pilotnov01',1));
 assert.throws(()=>gmailAlias('someone@example.com','pilotnov01',0));assert.throws(()=>gmailAlias('qa+tag@gmail.com','pilotnov01',0));assert.throws(()=>gmailAlias('qa@gmail.com','../bad',0));assert.throws(()=>gmailAlias('qa@gmail.com','pilotnov01',-1));
});
test('consent requests only read-only Gmail with offline PKCE and loopback callback',()=>{
 const verifier='v'.repeat(64),state='s'.repeat(48);const u=new URL(consentUrl(client,'http://127.0.0.1:12345/oauth2/callback',state,verifier));
 assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('scope'),GMAIL_READONLY);assert.equal(u.searchParams.get('access_type'),'offline');assert.equal(u.searchParams.get('prompt'),'consent');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('state'),state);assert.ok(!u.toString().includes(verifier));assert.equal(u.searchParams.get('include_granted_scopes'),'false');
 assert.throws(()=>consentUrl(client,'https://example.com/callback',state,verifier));assert.throws(()=>consentUrl({installed:{...client.installed,auth_uri:'https://evil.example/auth'}},'http://127.0.0.1:12345/oauth2/callback',state,verifier));
});
test('callback requires exact state and rejects denied or ambiguous authorization',()=>{
 const state='s'.repeat(48);assert.equal(callbackCode('/oauth2/callback?state='+state+'&code=offline-code',state),'offline-code');
 assert.throws(()=>callbackCode('/oauth2/callback?state=wrong&code=offline-code',state));assert.throws(()=>callbackCode('/oauth2/callback?state='+state+'&error=access_denied',state));assert.throws(()=>callbackCode('/other?state='+state+'&code=offline-code',state));assert.throws(()=>callbackCode('/oauth2/callback?state='+state+'&code=a&code=b',state));
});
