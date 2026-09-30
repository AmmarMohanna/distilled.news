import { readFile,readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { afterEach,expect,it,vi } from "vitest";
import { chromium } from "@playwright/test";
import { SelfHostedChromiumProvider,XAuthenticatedSiteAdapter } from "@distilled/agent-runtime";
import { manualAuthenticatedProfileBootstrap } from "./authenticated-profile-manual-bootstrap";
import { provisionAuthenticatedProfile } from "./authenticated-profile-provisioning";
import type { Env } from "./types";
let mf:Miniflare|undefined;
afterEach(async()=>{await mf?.dispose();vi.restoreAllMocks()});
it("manually captures with existing encryption, fences writes, restores in fresh Chromium, and enables only after verification",async()=>{
  const logs=vi.spyOn(console,"error").mockImplementation(()=>{});
  mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:["DB"],r2Buckets:["AUTHENTICATED_SECRETS"]});
  const db=await mf.getD1Database("DB");
  for(const name of (await readdir(new URL("../migrations/",import.meta.url))).filter(n=>n.endsWith(".sql")).sort()){
    const sql=(await readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8")).split(/\r?\n/).filter(l=>!l.trimStart().startsWith("--")).join("\n");
    for(const statement of sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  await db.prepare("INSERT INTO accounts(id,email,normalized_email,username,role,password_hash,email_verified_at,created_at,updated_at) VALUES('account_manual','manual@example.invalid','manual@example.invalid','manual','admin','hash','2026-01-01','2026-01-01','2026-01-01')").run();
  const bucket=await mf.getR2Bucket("AUTHENTICATED_SECRETS");
  const env={DB:db,AUTHENTICATED_SECRETS:bucket,WEB_OPERATOR_RUNTIME_TOKEN:"operator",AUTH_PROFILE_ACTIVE_KEY_ID:"v1",AUTH_PROFILE_ENCRYPTION_KEYS:JSON.stringify({v1:Buffer.alloc(32,9).toString("base64")})} as unknown as Env;
  const provision=await provisionAuthenticatedProfile(new Request("https://worker.test/v1/authenticated-profiles",{method:"POST",headers:{authorization:"Bearer operator","content-type":"application/json"},body:JSON.stringify({tenantId:"account_manual",ownerId:"account_manual",site:"x",username:"never-read-user",password:"never-read-password"})}),env);
  const profileId=(await provision.json() as {authenticatedProfileId:string}).authenticatedProfileId;
  // Remove the credential blob. Manual login must never depend on it.
  const credential=await db.prepare("SELECT encrypted_credential_ref FROM credential_profiles").first<{encrypted_credential_ref:string}>();await bucket.delete(credential!.encrypted_credential_ref);
  const call=(body:unknown,token="operator",url="https://worker.test/v1/authenticated-profiles/manual-bootstrap")=>manualAuthenticatedProfileBootstrap(new Request(url,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)}),env);
  expect((await call({action:"begin"},"wrong")).status).toBe(401);
  expect((await call({action:"begin"},"operator","http://worker.test/")).status).toBe(400);
  expect((await call({action:"capture",requestId:"no",state:{cookies:[],origins:[]}})).status).toBe(409);
  const admission=await (await call({action:"begin",profileId})).json() as {requestId:string};
  expect((await call({action:"challenge",requestId:admission.requestId,kind:"MFA"})).status).toBe(200);
  expect(await db.prepare("SELECT state FROM authenticated_browser_challenges").first()).toMatchObject({state:"UNSUPPORTED"});
  expect((await call({action:"capture",requestId:admission.requestId,state:{cookies:[],origins:[]}})).status).toBe(400);
  const adapter=new XAuthenticatedSiteAdapter(true);
  const browser=new SelfHostedChromiumProvider({testOnlyPrivateNetwork:true,launchBrowser:options=>chromium.launch({...options,headless:true})});
  let scope=await browser.allocate({runId:admission.requestId,tenantId:"account_manual",generation:1,allowedOrigins:["https://x.com","https://twitter.com"]});
  const installFixture=async()=>{
    const live=(browser as unknown as {sessions:Map<string,{page:import('@playwright/test').Page}>}).sessions.get(scope.sessionId)!;
    await live.page.route("**/*",async route=>{
      const cookie=(await route.request().allHeaders()).cookie??"";
      if(!cookie.includes("auth_token=SYNTHETIC_SESSION_SECRET"))return route.fulfill({status:302,headers:{location:"https://x.com/i/flow/login"}});
      return route.fulfill({status:200,contentType:"text/html",body:'<title>Home / X</title><a href="/home">Home</a><a href="/manual" data-testid="AppTabBar_Profile_Link">Profile</a><button data-testid="SideNav_AccountSwitcher_Button">Account</button>'});
    });
  };
  try{
    await installFixture();
    // Synthetic manual login completion; no real X credentials enter any test.
    await browser.attachAuthenticatedSession(scope,{cookies:[{name:"auth_token",value:"SYNTHETIC_SESSION_SECRET",domain:".x.com",path:"/",expires:-1,httpOnly:true,secure:true,sameSite:"None"}],origins:[]});
    await browser.navigate(scope,"https://x.com/home");expect((await browser.detectAuthenticatedState(scope,adapter)).state).toBe("ACTIVE");
    const captured=await browser.exportAuthenticatedSession(scope);
    const capture=await call({action:"capture",requestId:admission.requestId,state:captured});expect(capture.status).toBe(200);expect(await capture.json()).toEqual({encryptedSessionPersisted:true});
    expect((await call({action:"capture",requestId:admission.requestId,state:captured})).status).toBe(409);
    const profile=await db.prepare("SELECT session_state,encrypted_session_ref,last_validated_at FROM authenticated_site_profiles WHERE id=?").bind(profileId).first<{session_state:string;encrypted_session_ref:string;last_validated_at:string|null}>();
    expect(profile!.session_state).toBe("REAUTH_REQUIRED");
    expect(profile!.last_validated_at).toBeNull();
    const encrypted=await (await bucket.get(profile!.encrypted_session_ref))!.text();expect(JSON.parse(encrypted)).toMatchObject({algorithm:"AES-256-GCM",version:1,keyId:"v1"});expect(encrypted).not.toContain("SYNTHETIC_SESSION_SECRET");
    await browser.close(scope);
    const restored=await (await call({action:"restore",requestId:admission.requestId})).json() as {state:typeof captured};expect(restored.state).toEqual(captured);
    scope=await browser.allocate({runId:admission.requestId,tenantId:"account_manual",generation:2,allowedOrigins:["https://x.com","https://twitter.com"]});
    expect((await browser.exportAuthenticatedSession(scope)).cookies).toHaveLength(0);await installFixture();
    await browser.attachAuthenticatedSession(scope,restored.state);await browser.navigate(scope,"https://x.com/home");expect((await browser.detectAuthenticatedState(scope,adapter)).state).toBe("ACTIVE");
    expect((await (await call({action:"verify",requestId:admission.requestId,restored:true})).json())).toEqual({encryptedSessionPersisted:true,freshContextRestored:true});
    const verifiedProfile=await db.prepare("SELECT session_state,last_validated_at FROM authenticated_site_profiles WHERE id=?").bind(profileId).first<{session_state:string;last_validated_at:string|null}>();
    expect(verifiedProfile).toMatchObject({session_state:"ACTIVE"});expect(verifiedProfile?.last_validated_at).toBeTruthy();
    expect((await call({action:"restore",requestId:admission.requestId})).status).toBe(409);
    const second=await (await call({action:"begin",profileId})).json() as {requestId:string};
    await call({action:"capture",requestId:second.requestId,state:captured});await call({action:"verify",requestId:second.requestId,restored:false});
    expect(await db.prepare("SELECT session_state FROM authenticated_site_profiles WHERE id=?").bind(profileId).first()).toMatchObject({session_state:"REAUTH_REQUIRED"});
    const abandoned=await (await call({action:"begin",profileId})).json() as {requestId:string};
    expect(await (await call({action:"abort",requestId:abandoned.requestId})).json()).toEqual({closed:true});
    expect(await db.prepare("SELECT state,failure_code FROM authenticated_profile_bootstrap_requests WHERE request_id=?").bind(abandoned.requestId).first()).toMatchObject({state:"failed",failure_code:"MANUAL_LOGIN_NOT_COMPLETED"});
    expect((await call({action:"capture",requestId:abandoned.requestId,state:captured})).status).toBe(409);
    expect((await call({action:"begin",profileId,secret:"DO_NOT_ECHO"})).status).toBe(400);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/SYNTHETIC_SESSION_SECRET|never-read|DO_NOT_ECHO/);
    const audits=await db.prepare("SELECT safe_metadata_json FROM authenticated_profile_audit").all();expect(JSON.stringify(audits)).not.toMatch(/SYNTHETIC_SESSION_SECRET|never-read/);
  }finally{await browser.close(scope).catch(()=>undefined)}
},60_000);
