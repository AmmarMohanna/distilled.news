import {expect,it} from "vitest";
import {BrowserNavigationError} from "@distilled/agent-runtime";
import {AuthenticatedBrowserBridgeService,browserlessCdpUrl} from "../src/service";
import {MockBrowserProvider,baseCapability,req,send} from "./support";

it("accepts only an authenticated Browserless WebSocket endpoint",()=>{
  expect(browserlessCdpUrl("wss://production-sfo.browserless.io/stealth?proxy=residential","provider-secret")).toBe("wss://production-sfo.browserless.io/stealth?proxy=residential&token=provider-secret");
  for(const endpoint of ["ws://production-sfo.browserless.io","wss://127.0.0.1/stealth","wss://browserless.io.evil.test/stealth","wss://user:pass@production-sfo.browserless.io/stealth","wss://production-sfo.browserless.io/stealth?token=already"]){
    expect(()=>browserlessCdpUrl(endpoint,"provider-secret")).toThrow("remote browser endpoint invalid");
  }
});

it("enables ordinary site features only for an X authentication execution",async()=>{
  for(const siteKind of ["x","PUBLIC"] as const){
    const provider=new MockBrowserProvider();
    const service=new AuthenticatedBrowserBridgeService({serviceCredential:"test_bridge_secret_key_1234567890abcdef",provider});
    const capability=baseCapability({siteKind,...(siteKind==="PUBLIC"?{writeOrigins:[]}:{authEntryPoint:"https://x.com/login",sessionProbeUrl:"https://x.com/home",allowedOrigins:["https://x.com"],writeOrigins:["https://x.com"]})});
    try{
      expect((await send(service,req("OPEN_AUTH_BROWSER",capability,`open_${siteKind}`))).status).toBe(200);
      expect(Boolean(provider.lastAuthenticationBootstrap)).toBe(siteKind==="x");
    }finally{await service.shutdown()}
  }
});

it("keeps public and X executions on separate browser providers",()=>{
  const priorEndpoint=process.env.BROWSERLESS_CDP_ENDPOINT,priorToken=process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSERLESS_CDP_ENDPOINT="wss://production-sfo.browserless.io/stealth";
  process.env.BROWSERLESS_API_TOKEN="synthetic-provider-token";
  try{
    const service=new AuthenticatedBrowserBridgeService({serviceCredential:"synthetic-bridge-secret"});
    const choose=(service as unknown as {providerFor(capability:ReturnType<typeof baseCapability>):unknown}).providerFor.bind(service);
    const x=choose(baseCapability({siteKind:"x"}));
    const publicProvider=choose(baseCapability({siteKind:"PUBLIC"}));
    expect(x).not.toBe(publicProvider);
    expect(choose(baseCapability({siteKind:"x"}))).toBe(x);
    expect(choose(baseCapability({siteKind:"PUBLIC"}))).toBe(publicProvider);
  }finally{
    if(priorEndpoint===undefined)delete process.env.BROWSERLESS_CDP_ENDPOINT;else process.env.BROWSERLESS_CDP_ENDPOINT=priorEndpoint;
    if(priorToken===undefined)delete process.env.BROWSERLESS_API_TOKEN;else process.env.BROWSERLESS_API_TOKEN=priorToken;
  }
});

it("routes X to configured Chrome while public executions retain Chromium",()=>{
  const priorChannel=process.env.BROWSER_BRIDGE_X_BROWSER_CHANNEL,priorEndpoint=process.env.BROWSERLESS_CDP_ENDPOINT,priorToken=process.env.BROWSERLESS_API_TOKEN;
  process.env.BROWSER_BRIDGE_X_BROWSER_CHANNEL="chrome";delete process.env.BROWSERLESS_CDP_ENDPOINT;delete process.env.BROWSERLESS_API_TOKEN;
  try{
    const service=new AuthenticatedBrowserBridgeService({serviceCredential:"synthetic-bridge-secret"});
    const choose=(service as unknown as {providerFor(capability:ReturnType<typeof baseCapability>):unknown}).providerFor.bind(service);
    const x=choose(baseCapability({siteKind:"x"}));
    expect(x).not.toBe(choose(baseCapability({siteKind:"PUBLIC"})));
    expect(choose(baseCapability({siteKind:"x"}))).toBe(x);
  }finally{
    if(priorChannel===undefined)delete process.env.BROWSER_BRIDGE_X_BROWSER_CHANNEL;else process.env.BROWSER_BRIDGE_X_BROWSER_CHANNEL=priorChannel;
    if(priorEndpoint===undefined)delete process.env.BROWSERLESS_CDP_ENDPOINT;else process.env.BROWSERLESS_CDP_ENDPOINT=priorEndpoint;
    if(priorToken===undefined)delete process.env.BROWSERLESS_API_TOKEN;else process.env.BROWSERLESS_API_TOKEN=priorToken;
  }
});

it("returns only a bounded runtime code when Chrome navigation fails",async()=>{
  class TimeoutProvider extends MockBrowserProvider{override async navigateAuthenticationEntrypoint():Promise<never>{throw new BrowserNavigationError("NAVIGATION_TIMEOUT")}}
  const provider=new TimeoutProvider(),service=new AuthenticatedBrowserBridgeService({serviceCredential:"test_bridge_secret_key_1234567890abcdef",provider});
  const capability=baseCapability();
  try{
    expect((await send(service,req("OPEN_AUTH_BROWSER",capability,"runtime_open"))).status).toBe(200);
    const result=await send(service,req("NAVIGATE_AUTH_ENTRYPOINT",capability,"runtime_navigate"));
    expect(result.json).toMatchObject({error:{code:"BRIDGE_BROWSER_FAILURE",diagnostic:{runtimeFailureCode:"NAVIGATION_TIMEOUT"}}});
  }finally{await service.shutdown()}
});
