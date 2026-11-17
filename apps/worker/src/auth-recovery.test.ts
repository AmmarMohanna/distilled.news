import {expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import {hashPassword} from './auth';
import type {Env} from './types';

function fixture(){
 const repo=new InMemoryRepository(),app=createApp({repository:repo});
 const messages:Array<{to:string;subject:string;text:string}>=[];
 const config={ADMIN_SESSION_SECRET:'test-session',EMAIL_FROM:'Distilled.news <sender@example.invalid>',PUBLIC_WEB_BASE_URL:'https://distilled.news',EMAIL:{send:async(m:{to:string;subject:string;text:string})=>{messages.push(m)}}} as unknown as Env;
 const post=(path:string,body:unknown)=>app.request(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)},config);
 const add=async(email='pending@example.invalid',verified=false)=>repo.createAccount({email,username:email.split('@')[0],passwordHash:await hashPassword('original-password'),role:'user',...(verified?{emailVerifiedAt:new Date().toISOString()}:{})});
 return {repo,config,messages,post,add};
}
it('resends verification for a normalized pending account without changing its identity, password or authentication state',async()=>{
 const x=fixture(),before=await x.add();
 const r=await x.post('/api/auth/verification/resend',{email:' PENDING@EXAMPLE.INVALID ',language:'fr'});
 expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});expect(r.headers.get('set-cookie')).toBeNull();
 expect(x.messages).toHaveLength(1);expect(x.messages[0].subject).toContain('Distilled.News');expect(x.messages[0].text).toContain('https://distilled.news/verify-email?token=');expect(x.messages[0].text).toContain('lang=fr');
 expect(await x.repo.getAccountById(before.id)).toEqual(before);
 const login=await x.post('/api/auth/login',{email:before.email,password:'original-password'});expect(login.status).toBe(403);expect(await login.json()).toEqual({error:'verify your email before logging in'});
 const token=new URL(x.messages[0].text.match(/https:\/\/[^\s]+/)![0]).searchParams.get('token');
 expect((await x.post('/api/auth/verify-email',{token})).status).toBe(200);
 expect((await x.post('/api/auth/login',{email:before.email,password:'original-password'})).status).toBe(200);
});
it('routes password recovery to verification for an unverified account, never issues a reset token first',async()=>{
 const x=fixture(),account=await x.add();const r=await x.post('/api/auth/password/forgot',{email:account.email});
 expect(r.status).toBe(200);expect(x.messages).toHaveLength(1);expect(x.messages[0].text).toContain('/verify-email?');expect(x.messages[0].text).not.toContain('/reset-password?');expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeUndefined();
});
it('preserves real password reset for verified accounts and uses generic responses for unknown/disabled/verified resend',async()=>{
 const x=fixture(),verified=await x.add('verified@example.invalid',true),disabled=await x.add('disabled@example.invalid');await x.repo.updateAccount({id:disabled.id,disabled:true});
 for(const email of ['unknown@example.invalid',verified.email,disabled.email]){
  const r=await x.post('/api/auth/verification/resend',{email});expect(r.status).toBe(200);expect(await r.json()).toEqual({ok:true});
 }
 expect(x.messages).toHaveLength(0);
 await x.post('/api/auth/password/forgot',{email:verified.email});expect(x.messages[0].text).toContain('/reset-password?');
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
