import {expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import {hashPassword,hashToken} from './auth';
import type {Env} from './types';

function fixture(){
 const repo=new InMemoryRepository(),app=createApp({repository:repo});
 const messages:Array<{to:string;subject:string;text:string}>=[];
 const config={ADMIN_SESSION_SECRET:'test-session',EMAIL_FROM:'Distilled.news <sender@example.invalid>',PUBLIC_WEB_BASE_URL:'https://distilled.news',EMAIL:{send:async(m:{to:string;subject:string;text:string})=>{messages.push(m)}}} as unknown as Env;
 const post=(path:string,body:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},config);
 const add=async(email='pending@example.invalid',verified=false)=>repo.createAccount({email,username:email.split('@')[0],passwordHash:await hashPassword('original-password'),role:'user',...(verified?{emailVerifiedAt:new Date().toISOString()}:{})});
 return {app,repo,config,messages,post,add};
}
it('resends verification for a normalized pending account without changing its identity, password or authentication state',async()=>{
 const x=fixture(),before=await x.add();
 const r=await x.post('/api/auth/verification/resend',{email:' PENDING@EXAMPLE.INVALID ',language:'fr'});
 expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(r.headers.get('set-cookie')).toBeNull();
 expect(x.messages).toHaveLength(1);expect(x.messages[0].text).not.toMatch(/https?:/);
 const code=x.messages[0].text.match(/^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/m)![0];
 expect(await x.repo.getAccountById(before.id)).toEqual(before);
 const login=await x.post('/api/auth/login',{email:before.email,password:'original-password'});expect(login.status).toBe(403);expect(await login.json()).toEqual({error:'verify your email before logging in'});
 expect((await x.post('/api/auth/verify-email',{email:'other@example.invalid',code})).status).toBe(400);
 const first=await x.post('/api/auth/verify-email',{email:before.email,code:code.toLowerCase()});
 expect(first.status).toBe(200);expect(first.headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(before.id))?.emailVerifiedAt).toBeDefined();
 expect(await (await x.app.request('/api/auth/session',{},x.config)).json()).toMatchObject({authenticated:false});
 const replay=await x.post('/api/auth/verify-email',{email:before.email,code});
 expect(replay.status).toBe(400);expect(replay.headers.get('set-cookie')).toBeNull();
 expect((await x.post('/api/auth/login',{email:before.email,password:'original-password'})).status).toBe(200);
});
it('verifies legacy email links without creating a session',async()=>{
 const x=fixture(),account=await x.add(),token='retained-verification-token';
 await x.repo.createAuthToken({accountId:account.id,purpose:'email_verification',tokenHash:await hashToken(token),expiresAt:new Date(Date.now()+60_000).toISOString()});
 const response=await x.post('/api/auth/verify-email',{token});
 expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeDefined();
 expect(await (await x.app.request('/api/auth/session',{},x.config)).json()).toMatchObject({authenticated:false});
});
it('routes password recovery to verification for an unverified account, never issues a reset token first',async()=>{
 const x=fixture(),account=await x.add();const r=await x.post('/api/auth/password/forgot',{email:account.email});
 expect(r.status).toBe(200);expect(x.messages).toHaveLength(1);expect(x.messages[0].text).toMatch(/^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/m);expect(x.messages[0].text).not.toContain('/reset-password?');expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeUndefined();
});
it('preserves real password reset and keeps unknown/disabled resend responses generic',async()=>{
 const x=fixture(),verified=await x.add('verified@example.invalid',true),disabled=await x.add('disabled@example.invalid');await x.repo.updateAccount({id:disabled.id,disabled:true});
 for(const email of ['unknown@example.invalid',disabled.email]){
  const r=await x.post('/api/auth/verification/resend',{email});expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});
 }
 expect(x.messages).toHaveLength(0);
 await x.post('/api/auth/password/forgot',{email:verified.email});expect(x.messages[0].text).toContain('/reset-password?');
});
it('rejects another verification request for a verified address without sending mail or creating a session',async()=>{
 const x=fixture(),account=await x.add('verified@example.invalid',true);
 const response=await x.post('/api/auth/verification/resend',{email:' VERIFIED@EXAMPLE.INVALID '});
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({error:'Email is already verified. Please sign in or reset your password.'});
 expect(response.headers.get('set-cookie')).toBeNull();expect(x.messages).toHaveLength(0);
 expect(await x.repo.getAccountById(account.id)).toEqual(account);
});
it('recognizes verified addresses immediately on registration without changing the account or sending mail',async()=>{
 const x=fixture(),account=await x.add('verified@example.invalid',true);
 const response=await x.post('/api/auth/register',{email:'VERIFIED@EXAMPLE.INVALID',username:'another-name',password:'another-password'});
 expect(response.status).toBe(409);
 expect(await response.json()).toEqual({error:'Email is already verified. Please sign in or reset your password.'});
 expect(response.headers.get('set-cookie')).toBeNull();expect(x.messages).toHaveLength(0);
 expect(await x.repo.getAccountById(account.id)).toEqual(account);
});
it('keeps pending accounts eligible for verification recovery after registration is rejected',async()=>{
 const x=fixture(),account=await x.add();
 const response=await x.post('/api/auth/register',{email:account.email,username:'another-name',password:'another-password'});
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'email is already registered'});
 expect(x.messages).toHaveLength(0);expect(await x.repo.getAccountById(account.id)).toEqual(account);
});
it('shares verification resend throttling with password recovery and never bypasses it by changing route',async()=>{
 const x=fixture(),a=await x.add();for(let i=0;i<5;i++)expect((await x.post(i%2?'/api/auth/password/forgot':'/api/auth/verification/resend',{email:a.email})).status).toBe(200);
 expect(x.messages).toHaveLength(5);expect((await x.post('/api/auth/verification/resend',{email:a.email})).status).toBe(429);expect(x.messages).toHaveLength(5);
});
it('does not delete a pending account or alter its password when resend submission fails',async()=>{
 const x=fixture(),before=await x.add(),spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 x.config.EMAIL={send:async()=>{throw Error('Provider unavailable')}} as Env['EMAIL'];
 try{const r=await x.post('/api/auth/verification/resend',{email:before.email});expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(await x.repo.getAccountById(before.id)).toEqual(before);expect(spy).toHaveBeenCalled();}finally{spy.mockRestore()}
});
it('checks configured bot verification before sending recovery mail',async()=>{
 const x=fixture();await x.add();x.config.TURNSTILE_SECRET_KEY='secret';
 const fetcher=vi.fn(async()=>Response.json({success:false}));vi.stubGlobal('fetch',fetcher);
 try{const r=await x.post('/api/auth/verification/resend',{email:'pending@example.invalid',turnstileToken:'invalid'});expect(r.status).toBe(200);expect(x.messages).toHaveLength(0);}finally{vi.unstubAllGlobals()}
});


it('rejects malformed resend input before email submission',async()=>{
 const x=fixture();for(const body of [{email:'invalid'},{email:'pending@example.invalid',language:'unknown'}])expect((await x.post('/api/auth/verification/resend',body)).status).toBe(400);expect(x.messages).toHaveLength(0);
});
it('keeps password recovery generic when verification submission fails without deleting the account',async()=>{
 const x=fixture(),before=await x.add(),spy=vi.spyOn(console,'error').mockImplementation(()=>{});x.config.EMAIL={send:async()=>{throw Error('Provider unavailable')}} as Env['EMAIL'];
 try{const r=await x.post('/api/auth/password/forgot',{email:before.email});expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(await x.repo.getAccountById(before.id)).toEqual(before);expect(r.headers.get('set-cookie')).toBeNull();expect(spy).toHaveBeenCalledWith('Could not send verification recovery email',expect.objectContaining({accountId:before.id,error:'Provider unavailable'}));}finally{spy.mockRestore()}
});
