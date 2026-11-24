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
 expect(x.messages).toHaveLength(1);
 const url = new URL(x.messages[0].text.match(/https:\/\/\S+/)![0]);
 expect(url.pathname).toBe('/verify-email');
 expect(url.searchParams.get('lang')).toBe('fr');
 const token = url.searchParams.get('token')!;
 const record = await x.repo.getAuthToken(await hashToken(token), 'email_verification');
 expect(Date.parse(record!.expiresAt) - Date.parse(record!.createdAt)).toBeCloseTo(24 * 60 * 60 * 1000, -3);
 expect(await x.repo.getAccountById(before.id)).toEqual(before);
 const login=await x.post('/api/auth/login',{email:before.email,password:'original-password'});expect(login.status).toBe(403);expect(await login.json()).toEqual({error:'verify your email before logging in'});
 await x.app.request(url.toString(), {}, x.config);
 expect((await x.repo.getAccountById(before.id))?.emailVerifiedAt).toBeUndefined();
 const first=await x.post('/api/auth/verify-email',{token});
 expect(first.status).toBe(200);expect(first.headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(before.id))?.emailVerifiedAt).toBeDefined();
 expect(await (await x.app.request('/api/auth/session',{},x.config)).json()).toMatchObject({authenticated:false});
 const replay=await x.post('/api/auth/verify-email',{token});
 expect(replay.status).toBe(400);expect(replay.headers.get('set-cookie')).toBeNull();
 expect((await x.post('/api/auth/login',{email:before.email,password:'original-password'})).status).toBe(200);
});
it('still accepts an already-issued code only for its associated address and only once', async () => {
 const x = fixture(), account = await x.add(), code = 'ABCD-EFGH-JKLM-NPQR';
 await x.repo.createAuthToken({accountId: account.id, purpose: 'email_verification', tokenHash: await hashToken('code-v1:ABCDEFGHJKLMNPQR'), expiresAt: new Date(Date.now() + 60_000).toISOString()});
 expect((await x.post('/api/auth/verify-email', {email: 'other@example.invalid', code})).status).toBe(400);
 const response = await x.post('/api/auth/verify-email', {email: account.email, code: code.toLowerCase()});
 expect(response.status).toBe(200);
 expect(response.headers.get('set-cookie')).toBeNull();
 expect((await x.post('/api/auth/verify-email', {email: account.email, code})).status).toBe(400);
});
it('verifies legacy email links without creating a session',async()=>{
 const x=fixture(),account=await x.add(),token='retained-verification-token';
 await x.repo.createAuthToken({accountId:account.id,purpose:'email_verification',tokenHash:await hashToken(token),expiresAt:new Date(Date.now()+60_000).toISOString()});
 const response=await x.post('/api/auth/verify-email',{token});
 expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeDefined();
 expect(await (await x.app.request('/api/auth/session',{},x.config)).json()).toMatchObject({authenticated:false});
});
it('sends a dedicated reset link to a pending account and verifies the mailbox only when the password is saved', async () => {
 const x = fixture(), account = await x.add();
 expect((await x.post('/api/auth/password/forgot', {email: account.email})).status).toBe(200);
 expect(x.messages).toHaveLength(1);
 const resetUrl = new URL(x.messages[0].text.match(/https:\/\/\S+/)![0]);
 expect(resetUrl.pathname).toBe('/reset-password');
 const token = resetUrl.searchParams.get('token')!;
 await x.app.request(resetUrl.toString(), {}, x.config);
 expect((await x.post('/api/auth/verify-email', {token})).status).toBe(400);
 expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeUndefined();

 const passwords = ['replacement-password', 'other-valid-password'];
 const attempts = await Promise.all(passwords.map(password => x.post('/api/auth/password/reset', {token, password})));
 expect(attempts.map(response => response.status).sort()).toEqual([200, 400]);
 const accepted = attempts.findIndex(response => response.status === 200);
 expect(attempts[accepted].headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeDefined();
 expect((await x.post('/api/auth/login', {email: account.email, password: 'original-password'})).status).toBe(401);
 expect((await x.post('/api/auth/login', {email: account.email, password: passwords[accepted]})).status).toBe(200);
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
it('keeps password recovery generic when reset email submission fails without deleting the account',async()=>{
 const x=fixture(),before=await x.add(),spy=vi.spyOn(console,'error').mockImplementation(()=>{});x.config.EMAIL={send:async()=>{throw Error('Provider unavailable')}} as Env['EMAIL'];
 try{const r=await x.post('/api/auth/password/forgot',{email:before.email});expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(await x.repo.getAccountById(before.id)).toEqual(before);expect(r.headers.get('set-cookie')).toBeNull();expect(spy).toHaveBeenCalledWith('Could not send password reset email',expect.objectContaining({accountId:before.id,error:'Provider unavailable'}));}finally{spy.mockRestore()}
});
