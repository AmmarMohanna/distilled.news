import type {Server} from "node:http";
import type {AddressInfo} from "node:net";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {
  AuthenticatedBrowserBridgeExecutor,
  HttpAuthenticatedBrowserBridgeClient,
  type AuthenticatedBrowserBridgeRequest,
  type AuthenticatedBrowserSurface
} from "@distilled/agent-runtime";
import {AuthenticatedBrowserBridgeService} from "../src/service";
import {createBridgeHttpServer} from "../src/server";
import {SYNTHETIC_COOKIE,SYNTHETIC_IDENTIFIER,SYNTHETIC_PASSWORD,SyntheticAuthAdapter,SyntheticSite,allocate,newFlow} from "./synthetic-site";
import {baseCapability,req} from "./support";

const BRIDGE_SECRET="bridge_integration_test_secret_32bytes_!";
const providerSessions=(service:AuthenticatedBrowserBridgeService)=>((service as unknown as {provider:{sessions:Map<string,unknown>}}).provider.sessions.size);

describe("real HTTP bridge → real SelfHostedChromiumProvider → synthetic authentication site",()=>{
  const site=new SyntheticSite();
  let bridgeServer:Server;let bridgeUrl:string;let service:AuthenticatedBrowserBridgeService;let adapter:SyntheticAuthAdapter;

  beforeAll(async()=>{
    await site.start();adapter=new SyntheticAuthAdapter(site.origin);
    service=new AuthenticatedBrowserBridgeService({serviceCredential:BRIDGE_SECRET,allowTestMode:true});
    bridgeServer=createBridgeHttpServer(service);
    await new Promise<void>(resolve=>bridgeServer.listen(0,"127.0.0.1",resolve));
    bridgeUrl=`http://127.0.0.1:${(bridgeServer.address() as AddressInfo).port}/v1/authenticated-browser`;
  });
  afterAll(async()=>{await service.shutdown().catch(()=>undefined);await new Promise<void>(resolve=>bridgeServer.close(()=>resolve()));await site.stop()});

  it("runs /login → identifier → Continue → password → Log in → authenticated → capture → close",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"lifecycle"});const scope=await allocate(flow);
    try{
      const detection=await flow.executor.establishAuthenticatedSession(scope,adapter,{username:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD},undefined,undefined,flow.challenges);
      expect(detection).toMatchObject({state:"ACTIVE",reason:"synthetic_authenticated"});
      // The synthetic site saw the exact injected values, so injection genuinely happened in Chromium.
      expect(site.received.map(entry=>entry.path).filter(path=>path.startsWith("/login/step"))).toEqual(expect.arrayContaining(["/login/step1","/login/step2"]));
      const state=await flow.executor.exportAuthenticatedSession(scope);
      expect(state.cookies).toEqual(expect.arrayContaining([expect.objectContaining({name:"auth_session",value:SYNTHETIC_COOKIE})]));
      expect(await flow.executor.detectAuthenticatedState(scope,adapter)).toMatchObject({state:"ACTIVE"});
    }finally{
      await flow.executor.close(scope);
    }
    expect(await flow.executor.health(scope)).toBe("closed");
    expect(providerSessions(service)).toBe(0);expect(service.activeExecutionCount).toBe(0);
  },60_000);

  it("restores a captured session into a fresh isolated browser and verifies it via the capability-bound session probe",async()=>{
    const first=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"capture"});const scope=await allocate(first);let state;
    try{
      await first.executor.establishAuthenticatedSession(scope,adapter,{username:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD});
      state=await first.executor.exportAuthenticatedSession(scope);
    }finally{await first.executor.close(scope)}
    const second=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"restore"});
    const restored=await second.executor.allocate({runId:second.runId,tenantId:second.tenantId,generation:1,allowedOrigins:second.capability.allowedOrigins,authenticatedSessionState:state});
    try{
      await second.executor.navigate(restored,`${site.origin}/home`);
      expect(await second.executor.detectAuthenticatedState(restored,adapter)).toMatchObject({state:"ACTIVE"});
      await expect(second.executor.navigate(restored,`${site.origin}/anything-else`)).rejects.toMatchObject({code:"BRIDGE_NETWORK_POLICY_DENIED"});
    }finally{await second.executor.close(restored)}
    // A browser that was never given the session is not authenticated: state is per isolated context.
    const third=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"isolated"});const isolated=await allocate(third);
    try{await third.executor.navigate(isolated,`${site.origin}/home`);expect(await third.executor.detectAuthenticatedState(isolated,adapter)).not.toMatchObject({state:"ACTIVE"})}finally{await third.executor.close(isolated)}
  },60_000);

  it("reports a rejected credential as authentication rejection, not as an infrastructure failure",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"rejected"});const scope=await allocate(flow);
    try{expect(await flow.executor.establishAuthenticatedSession(scope,adapter,{username:SYNTHETIC_IDENTIFIER,password:"TEST_PASSWORD_SECRET_wrong"})).toMatchObject({state:"REAUTH_REQUIRED",reason:"synthetic_rejected"})}finally{await flow.executor.close(scope)}
  },60_000);

  it("detects a synthetic CAPTCHA, routes it through ChallengeCoordinator as DETECT_ONLY/UNSUPPORTED, then cleans up",async()=>{
    const captchaAdapter=new SyntheticAuthAdapter(site.origin,"/captcha");
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter:captchaAdapter,label:"captcha"});const scope=await allocate(flow);
    try{
      const detection=await flow.executor.establishAuthenticatedSession(scope,captchaAdapter,{username:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD},undefined,undefined,flow.challenges);
      expect(detection).toMatchObject({state:"CHALLENGE_REQUIRED",challengeKind:"CAPTCHA",challengeProviderOutcome:"UNSUPPORTED"});
      const records=[...flow.store.records.values()];
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({state:"UNSUPPORTED",resolutionOutcome:"DETECT_ONLY",providerKind:"self_hosted_chromium",challengeKind:"CAPTCHA"});
      expect(site.received.filter(entry=>entry.path.startsWith("/login/"))).not.toContainEqual(expect.objectContaining({body:expect.stringContaining("captcha")}));
    }finally{await flow.executor.close(scope)}
    expect(providerSessions(service)).toBe(0);
  },60_000);

  it("binds handles to the observation that produced them and rejects stale, forged and semantically mismatched use on a real page",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"handles"});const scope=await allocate(flow);const cap=flow.capability;let n=0;
    const call=(extra:Record<string,unknown>&{operation:string})=>flow.transport.execute({protocol:"v1",operationId:`op_${++n}`,capability:cap,...extra} as AuthenticatedBrowserBridgeRequest);
    try{
      await call({operation:"NAVIGATE_AUTH_ENTRYPOINT"});
      const surface=await call({operation:"OBSERVE_AUTH_SURFACE",wait:"AUTH_SURFACE"}) as AuthenticatedBrowserSurface;
      const username=surface.controls.find(control=>control.label==="Username")!,submit=surface.controls.find(control=>control.label==="Continue")!;
      expect(username.handle).not.toMatch(/Username|input|#|\[/);
      await expect(call({operation:"INJECT_AUTH_FIELD",fieldKind:"PASSWORD",fieldHandle:username.handle,pageRevision:surface.pageRevision,secretValue:"x"})).rejects.toMatchObject({code:"BRIDGE_FENCE_MISMATCH"});
      await expect(call({operation:"ACTIVATE_AUTH_CONTROL",controlKind:"LOGIN",controlHandle:submit.handle,pageRevision:surface.pageRevision})).rejects.toMatchObject({code:"BRIDGE_FENCE_MISMATCH"});
      await expect(call({operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:submit.handle,pageRevision:surface.pageRevision,secretValue:"x"})).rejects.toMatchObject({code:"BRIDGE_FENCE_MISMATCH"});
      await expect(call({operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:"handle_forged",pageRevision:surface.pageRevision,secretValue:"x"})).rejects.toMatchObject({code:"BRIDGE_OBSERVATION_STALE"});
      await expect(call({operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:username.handle,pageRevision:"stale_revision",secretValue:"x"})).rejects.toMatchObject({code:"BRIDGE_OBSERVATION_STALE"});
      await call({operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:username.handle,pageRevision:surface.pageRevision,secretValue:"harmless_synthetic_value"});
      // Injection invalidated every handle from that observation: replaying one must fail even though it is well-formed.
      await expect(call({operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:username.handle,pageRevision:surface.pageRevision,secretValue:"harmless_synthetic_value"})).rejects.toMatchObject({code:"BRIDGE_OBSERVATION_STALE"});
      await expect(call({operation:"ACTIVATE_AUTH_CONTROL",controlKind:"CONTINUE",controlHandle:submit.handle,pageRevision:surface.pageRevision})).rejects.toMatchObject({code:"BRIDGE_OBSERVATION_STALE"});
    }finally{await flow.executor.close(scope)}
  },60_000);

  it("fails closed on a cross-origin redirect before it is followed: the foreign origin gets no request, the foreign page is never returned, and the execution is terminated",async()=>{
    const bounce=new SyntheticAuthAdapter(site.origin,"/bounce");const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter:bounce,label:"redirect"});const scope=await allocate(flow);const call=(operation:string,id:string)=>flow.transport.execute({protocol:"v1",operationId:id,capability:flow.capability,operation} as AuthenticatedBrowserBridgeRequest);
    try{
      const hitsBefore=site.otherHits;
      await expect(call("NAVIGATE_AUTH_ENTRYPOINT","op_nav")).rejects.toMatchObject({code:"BRIDGE_NETWORK_POLICY_DENIED"});
      // Pre-dispatch: the redirect hop is failed before Chromium follows it, so the foreign origin never receives the request.
      expect(site.otherHits).toBe(hitsBefore);
      // Nothing further may run in a browser that left its fenced origins, and the browser is torn down.
      await expect(call("OBSERVE_AUTH_SURFACE","op_obs")).rejects.toMatchObject({code:"BRIDGE_EXECUTION_EXPIRED"});
      await expect(call("CAPTURE_AUTH_STATE","op_capture")).rejects.toMatchObject({code:"BRIDGE_EXECUTION_EXPIRED"});
      expect(providerSessions(service)).toBe(0);
    }finally{await flow.executor.close(scope)}
  },60_000);

  it("validates the observed URL server-side instead of trusting the caller's origin claim",async()=>{
    // The capability (allowedOrigins) names only the site. A page that ends up elsewhere must never be returned.
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"observed-origin"});const scope=await allocate(flow);
    const narrowed={...flow.capability,allowedOrigins:[site.origin],writeOrigins:[site.origin]};
    try{
      const surface=await flow.transport.execute({protocol:"v1",operationId:"op_1",capability:narrowed,operation:"OBSERVE_AUTH_SURFACE"}) as AuthenticatedBrowserSurface;
      expect(surface.url).toBe("about:blank");
    }finally{await flow.executor.close(scope)}
  },60_000);

  it("blocks private, loopback and metadata origins when not in explicit test mode",async()=>{
    const strict=new AuthenticatedBrowserBridgeService({serviceCredential:BRIDGE_SECRET});const server=createBridgeHttpServer(strict);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/authenticated-browser`;
    const transport=new HttpAuthenticatedBrowserBridgeClient({url,serviceCredential:BRIDGE_SECRET,allowLoopbackHttp:true});
    try{
      let index=0;
      for(const origin of[site.origin,"http://localhost:8080","http://169.254.169.254","http://10.0.0.5","http://192.168.1.1","http://[::1]:9000"]){
        const cap=baseCapability({bridgeExecutionId:`bridge_exec_private_${index}`,profileId:`profile_private_${index}`,runId:`run_private_${index++}`,authEntryPoint:`${origin}/login`,sessionProbeUrl:`${origin}/home`,allowedOrigins:[origin],writeOrigins:[origin]});
        await expect(transport.execute(req("OPEN_AUTH_BROWSER",cap,"op_open")),origin).rejects.toMatchObject({code:"BRIDGE_NETWORK_POLICY_DENIED"});
      }
      expect(strict.activeExecutionCount).toBe(0);
    }finally{await strict.shutdown();await new Promise<void>(resolve=>server.close(()=>resolve()))}
  },60_000);

  it("closes the real browser when the service shuts down mid-execution and when an execution is abandoned",async()=>{
    const local=new AuthenticatedBrowserBridgeService({serviceCredential:BRIDGE_SECRET,allowTestMode:true,idleTimeoutMs:400});const server=createBridgeHttpServer(local);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/authenticated-browser`;
    try{
      const abandoned=newFlow({bridgeUrl:url,secret:BRIDGE_SECRET,adapter,label:"abandoned"});await allocate(abandoned);expect(providerSessions(local)).toBe(1);
      await new Promise(resolve=>setTimeout(resolve,1_500));expect(providerSessions(local)).toBe(0);
      await expect(abandoned.transport.execute({protocol:"v1",operationId:"op_late",capability:abandoned.capability,operation:"OBSERVE_AUTH_SURFACE"})).rejects.toMatchObject({code:"BRIDGE_EXECUTION_EXPIRED"});
      const active=newFlow({bridgeUrl:url,secret:BRIDGE_SECRET,adapter,label:"shutdown"});await allocate(active);expect(providerSessions(local)).toBe(1);
      await local.shutdown();expect(providerSessions(local)).toBe(0);
    }finally{await local.shutdown();await new Promise<void>(resolve=>server.close(()=>resolve()))}
  },60_000);

  it("keeps the executor free of arbitrary-control surface",async()=>{
    const executor=new AuthenticatedBrowserBridgeExecutor({execute:async()=>{throw new Error("must not be called")}},()=>baseCapability());
    const scope={runId:"r",tenantId:"t",sessionId:"s",contextId:"c",generation:1,pageId:"p",viewport:{width:1,height:1,deviceScaleFactor:1}};
    for(const method of["inspectDom","inspectAccessibilityTree","extract","queryPageState"] as const)await expect((executor as unknown as Record<string,(scope:unknown)=>Promise<unknown>>)[method](scope),method).rejects.toMatchObject({code:"BRIDGE_OPERATION_UNKNOWN"});
    await expect(executor.scroll(scope,10)).rejects.toMatchObject({code:"BRIDGE_OPERATION_UNKNOWN"});
    await expect(executor.followLink(scope,"h","r","c")).rejects.toMatchObject({code:"BRIDGE_OPERATION_UNKNOWN"});
  });
});
