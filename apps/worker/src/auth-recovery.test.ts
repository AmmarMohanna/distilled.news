import {expect,it,vi} from 'vitest';
import {createApp} from './app';
import {D1Repository,InMemoryRepository} from './repository';
import {readFileSync} from 'node:fs';
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';
import {hashEmailCode,hashPassword,hashToken} from './auth';
import type {Env,Repository} from './types';

function fixture(repo: Repository = new InMemoryRepository()){
 const app=createApp({repository:repo});
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
 const code = x.messages[0].text.match(/^([0-9]{6})$/m)![1];
 expect(x.messages[0].text).toContain('Valable 15 minutes.');
 expect(x.messages[0].text).not.toContain('https://');
 const record = await x.repo.getAuthToken(await hashEmailCode(before.email, code, x.config.ADMIN_SESSION_SECRET!), 'email_verification');
 expect(Date.parse(record!.expiresAt) - Date.parse(record!.createdAt)).toBeCloseTo(15 * 60 * 1000, -3);
 expect(await x.repo.getAccountById(before.id)).toEqual(before);
 const login=await x.post('/api/auth/login',{email:before.email,password:'original-password'});expect(login.status).toBe(403);expect(await login.json()).toEqual({error:'email verification code required'});
 const first=await x.post('/api/auth/verify-email',{email:before.email,code});
 expect(first.status).toBe(200);expect(first.headers.get('set-cookie')).toBeNull();
 expect((await x.repo.getAccountById(before.id))?.emailVerifiedAt).toBeDefined();
 expect(await (await x.app.request('/api/auth/session',{},x.config)).json()).toMatchObject({authenticated:false});
 const replay=await x.post('/api/auth/verify-email',{email:before.email,code});
 expect(replay.status).toBe(400);expect(replay.headers.get('set-cookie')).toBeNull();
 expect((await x.post('/api/auth/login',{email:before.email,password:'original-password'})).status).toBe(200);
});
it('rotates a code on resend and bounds parallel guesses per normalized address', async () => {
 const x=fixture(), account=await x.add();
 const resend=()=>x.post('/api/auth/verification/resend',{email:account.email});
 const codeFrom=(index:number)=>x.messages[index].text.match(/^([0-9]{6})$/m)![1];
 await resend();
 await resend();
 const previousCode=codeFrom(0), activeCode=codeFrom(1);
 expect(activeCode).not.toBe(previousCode);
 expect((await x.post('/api/auth/verify-email',{email:'other@example.invalid',code:activeCode})).status).toBe(400);
 expect((await x.post('/api/auth/verify-email',{email:account.email,code:previousCode})).status).toBe(400);
 const guesses=await Promise.all(Array.from({length:6},()=>x.post('/api/auth/verify-email',{
  email:account.email.toUpperCase(),code:previousCode
 })));
 expect(guesses.filter(response=>response.status===400)).toHaveLength(4);
 expect(guesses.filter(response=>response.status===429)).toHaveLength(2);
 expect((await x.post('/api/auth/verify-email',{email:account.email,code:activeCode})).status).toBe(429);
 expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeUndefined();
});

it('enforces expiry and single-use consumption against the D1 repository', async () => {
 const sqlite=new DatabaseSync(':memory:');
 try{
  const migration=readFileSync(new URL('../migrations/0006_accounts.sql',import.meta.url),'utf8');
  sqlite.exec(migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS accounts'),migration.indexOf('CREATE TABLE briefings_next')));
  const db={
   prepare:(sql:string)=>({bind:(...args:SQLInputValue[])=>({
    first:()=>sqlite.prepare(sql).get(...args)??null,
    all:()=>({results:sqlite.prepare(sql).all(...args)}),
    run:()=>({meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}})
   })}),
   batch:(statements:Array<{all:()=>unknown}>)=>{
    sqlite.exec('BEGIN');
    try{
     const results=statements.map(statement=>statement.all());
     sqlite.exec('COMMIT');
     return results;
    }catch(error){
     sqlite.exec('ROLLBACK');
     throw error;
    }
   }
  } as unknown as D1Database;
  const x=fixture(new D1Repository(db)), account=await x.add();
  const code='012345', tokenHash=await hashEmailCode(account.email,code,x.config.ADMIN_SESSION_SECRET!);
  const verify=(code:string)=>x.post('/api/auth/verify-email',{email:account.email,code});
  expect(await x.repo.replaceEmailVerificationCode({accountId:account.id,tokenHash,expiresAt:new Date(0).toISOString()})).toBe(true);
  expect((await verify(code)).status).toBe(400);
  const newCode='543210';
  const newHash=await hashEmailCode(account.email,newCode,x.config.ADMIN_SESSION_SECRET!);
  expect(await x.repo.replaceEmailVerificationCode({
   accountId:account.id,tokenHash:newHash,expiresAt:new Date(Date.now()+60_000).toISOString()
  })).toBe(true);
  const responses=await Promise.all([verify(newCode),verify(newCode)]);
  expect(responses.map(response=>response.status).sort()).toEqual([200,400]);
  expect((await x.repo.getAccountById(account.id))?.emailVerifiedAt).toBeDefined();
 }finally{sqlite.close();}
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
it('reports pending verification when a signup retry uses a different password',async()=>{
 const x=fixture(),account=await x.add();
 const response=await x.post('/api/auth/register',{email:account.email,username:'another-name',password:'another-password'});
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'email verification is pending'});
 expect(response.headers.get('set-cookie')).toBeNull();
 expect(x.messages).toHaveLength(0);expect(await x.repo.getAccountById(account.id)).toEqual(account);
});
it('resumes an unfinished signup with the original password and still accepts the emailed code',async()=>{
 const x=fixture();
 const signup={email:'pending@example.invalid',username:'pending',password:'original-password'};
 expect((await x.post('/api/auth/register',signup)).status).toBe(200);
 const original=await x.repo.getAccountByEmail(signup.email);
 const code=x.messages[0].text.match(/^([0-9]{6})$/m)![1];

 const retry=await x.post('/api/auth/register',{...signup,email:'PENDING@EXAMPLE.INVALID',username:'different-username'});
 expect(retry.status).toBe(200);
 expect(await retry.json()).toEqual({ok:true,verificationMethod:'code'});
 expect(retry.headers.get('set-cookie')).toBeNull();
 expect(x.messages).toHaveLength(1);
 expect(await x.repo.getAccountByEmail(signup.email)).toEqual(original);
 expect((await x.post('/api/auth/verify-email',{email:signup.email,code})).status).toBe(200);
 expect((await x.post('/api/auth/register',signup)).status).toBe(409);
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
