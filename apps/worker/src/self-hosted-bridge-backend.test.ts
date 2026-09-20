import { Miniflare } from "miniflare";
import { afterEach,describe,expect,it,vi } from "vitest";
import { AuthenticatedBrowserBridgeError,XAuthenticatedSiteAdapter,assertProductionChallengeProvider,type AuthenticatedBrowserBridgeRequest,type BrowserScope } from "@distilled/agent-runtime";
import { authenticatedBackend } from "./authenticated-profile-bootstrap";
import type { Env } from "./types";

const profile={id:"authenticated_profile_aaaaaaaaaaaaaaaa",tenantId:"account_a",ownerId:"account_a",version:3};
const input={runId:"authenticated_bootstrap_run",bootstrapRequestId:"bootstrap_request_1",profile,adapter:new XAuthenticatedSiteAdapter()};
const env=(overrides:Partial<Env>={})=>({DISTILLED_BROWSER_BACKEND:"local",DISTILLED_BROWSER_PROVIDER:"self_hosted",SELF_HOSTED_BROWSER_BRIDGE_URL:"https://bridge.example.test/v1/authenticated-browser",SELF_HOSTED_BROWSER_BRIDGE_AUTH:"dedicated-bridge-credential-not-the-runtime-token",WEB_OPERATOR_RUNTIME_TOKEN:"runtime-token-must-never-reach-the-bridge",...overrides}) as unknown as Env;

describe("self-hosted authenticated browser backend selection",()=>{
  afterEach(()=>vi.unstubAllGlobals());

  it("is opt-in: the default Cloudflare selection path is unchanged and never constructs a bridge client",()=>{
    const fetchSpy=vi.fn();vi.stubGlobal("fetch",fetchSpy);
    const cloudflare=authenticatedBackend(env({DISTILLED_BROWSER_PROVIDER:"cloudflare",DISTILLED_BROWSER_BACKEND:"cloudflare",BROWSER:{} as never,SELF_HOSTED_BROWSER_BRIDGE_URL:undefined,SELF_HOSTED_BROWSER_BRIDGE_AUTH:undefined}),input);
    expect(cloudflare.backend).toBe("cloudflare");expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed without a bridge URL or a dedicated credential",()=>{
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_URL:undefined}),input)).toThrow(/bridge URL and dedicated authentication/);
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_AUTH:undefined}),input)).toThrow(/bridge URL and dedicated authentication/);
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_AUTH:"   "}),input)).toThrow(/bridge URL and dedicated authentication/);
  });

  it("requires HTTPS, and honours loopback HTTP only when ENVIRONMENT is explicitly development (unset means production-safe)",()=>{
    const loopback="http://127.0.0.1:8789/v1/authenticated-browser";
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_URL:"http://bridge.example.test/v1/authenticated-browser"}),input)).toThrow(/HTTPS/);
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_URL:loopback}),input)).toThrow(/HTTPS/);
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_URL:loopback,ENVIRONMENT:"production"}),input)).toThrow(/HTTPS/);
    expect(()=>authenticatedBackend(env({SELF_HOSTED_BROWSER_BRIDGE_URL:loopback,ENVIRONMENT:"development"}),input)).not.toThrow();
  });

  it("selects the self-hosted provider with a production-safe DETECT_ONLY challenge provider",()=>{
    const selected=authenticatedBackend(env(),input);
    expect(selected.providerIdentity).toBe("SELF_HOSTED_CHROMIUM");expect(()=>assertProductionChallengeProvider(selected.challengeProvider)).not.toThrow();
    expect(selected.challengeProvider.capabilities()).toEqual({CAPTCHA:"DETECT_ONLY",MFA:"DETECT_ONLY",EMAIL_VERIFICATION:"DETECT_ONLY",SECURITY_CHALLENGE:"DETECT_ONLY",UNKNOWN:"DETECT_ONLY"});
  });

  it("mints a fully fenced capability, uses the dedicated credential only as a signature, and never sends the runtime token",async()=>{
    const sent:Array<{headers:Record<string,string>;body:AuthenticatedBrowserBridgeRequest}>=[];
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init:{headers:Record<string,string>;body:string})=>{const body=JSON.parse(init.body) as AuthenticatedBrowserBridgeRequest;sent.push({headers:init.headers,body});return new Response(JSON.stringify({protocol:"v1",ok:true,result:{runId:body.capability.runId,tenantId:body.capability.tenantId,sessionId:"session_1",contextId:"context_1",generation:body.capability.browserGeneration,pageId:"page_1",viewport:{width:1,height:1,deviceScaleFactor:1}}}))}));
    const selected=authenticatedBackend(env(),input);const adapter=new XAuthenticatedSiteAdapter();
    const scope=await selected.executor.allocate({runId:input.runId,tenantId:profile.tenantId,generation:1,allowedOrigins:[...adapter.authenticationNetworkOrigins]});
    const {capability,operation}=sent[0].body;
    expect(operation).toBe("OPEN_AUTH_BROWSER");
    expect(capability).toMatchObject({bootstrapRequestId:input.bootstrapRequestId,runId:input.runId,tenantId:"account_a",ownerId:"account_a",profileId:profile.id,expectedProfileVersion:3,browserGeneration:1,siteKind:"x",authEntryPoint:"https://x.com/login",sessionProbeUrl:"https://x.com/home",operationBudget:32});
    expect(capability.bridgeExecutionId).toMatch(/^bridge_execution_/);expect(capability.authFlowId).toMatch(/^auth_flow_/);
    expect(capability.allowedOrigins).toEqual([...adapter.authenticationNetworkOrigins]);expect(capability.writeOrigins).toEqual([...adapter.authenticationWriteOrigins]);
    expect(capability.writeOrigins.every(origin=>capability.allowedOrigins.includes(origin))).toBe(true);
    expect(Date.parse(capability.expiresAt)-Date.parse(capability.issuedAt)).toBe(120_000);
    const wire=JSON.stringify(sent);
    expect(wire).not.toContain("runtime-token-must-never-reach-the-bridge");expect(wire).not.toContain("dedicated-bridge-credential-not-the-runtime-token");
    expect(Object.keys(sent[0].headers).sort()).toEqual(["content-type","x-distilled-bridge-nonce","x-distilled-bridge-signature","x-distilled-bridge-timestamp"]);
    await selected.executor.close(scope as BrowserScope);
    expect(sent.map(entry=>entry.body.operation)).toEqual(["OPEN_AUTH_BROWSER","CLOSE_AUTH_BROWSER"]);
  });

  it("does not retry after an unknown effect: a lost mutation surfaces once as BRIDGE_EFFECT_UNKNOWN",async()=>{
    let attempts=0;
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init:{body:string})=>{const body=JSON.parse(init.body) as AuthenticatedBrowserBridgeRequest;if(body.operation==="OPEN_AUTH_BROWSER")return new Response(JSON.stringify({protocol:"v1",ok:true,result:{runId:body.capability.runId,tenantId:body.capability.tenantId,sessionId:"s",contextId:"c",generation:1,pageId:"p",viewport:{width:1,height:1,deviceScaleFactor:1}}}));if(body.operation==="CLOSE_AUTH_BROWSER")return new Response(JSON.stringify({protocol:"v1",ok:true,result:{closed:true}}));attempts++;throw new TypeError("connection reset")}));
    const selected=authenticatedBackend(env(),input);const adapter=new XAuthenticatedSiteAdapter();
    const scope=await selected.executor.allocate({runId:input.runId,tenantId:profile.tenantId,generation:1,allowedOrigins:[...adapter.authenticationNetworkOrigins]});
    await expect(selected.executor.attachAuthenticatedSession(scope,{cookies:[],origins:[]})).rejects.toMatchObject({code:"BRIDGE_EFFECT_UNKNOWN"});
    expect(attempts).toBe(1);await selected.executor.close(scope);
  });

  it("refuses to let the executor reach anything but the bounded authentication lifecycle",async()=>{
    const selected=authenticatedBackend(env(),input);const scope={runId:"r",tenantId:"t",sessionId:"s",contextId:"c",generation:1,pageId:"p",viewport:{width:1,height:1,deviceScaleFactor:1}};
    await expect(selected.executor.navigate(scope,"https://x.com/home")).rejects.toBeInstanceOf(AuthenticatedBrowserBridgeError);
    await expect(selected.executor.extract(scope)).rejects.toMatchObject({code:"BRIDGE_OPERATION_UNKNOWN"});
  });

  it("runs on the Workers runtime: workerd rejects fetch redirect:\"error\", which Node accepts, so the bridge client must use \"manual\"",async()=>{
    // Regression guard for a bug that every Node-side test missed and only the production Worker preflight exposed.
    const mf=new Miniflare({modules:true,outboundService:()=>new Response("ok"),script:`export default{async fetch(){const out={};for(const mode of["error","manual","follow"]){try{await fetch("http://bridge.test/",{redirect:mode});out[mode]="ok"}catch(error){out[mode]=error.name}}return Response.json(out)}}`});
    try{expect(await (await mf.dispatchFetch("http://worker.test/")).json()).toEqual({error:"TypeError",manual:"ok",follow:"ok"})}finally{await mf.dispose()}
    const client=await import("@distilled/agent-runtime");
    expect(client.HttpAuthenticatedBrowserBridgeClient.toString()).not.toMatch(/redirect:\s*"error"/);
  },30_000);
});
