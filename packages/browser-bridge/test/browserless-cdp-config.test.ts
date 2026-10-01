import {expect,it} from "vitest";
import {AuthenticatedBrowserBridgeService,browserlessCdpUrl} from "../src/service";
import {baseCapability} from "./support";

it("accepts only an authenticated Browserless WebSocket endpoint",()=>{
  expect(browserlessCdpUrl("wss://production-sfo.browserless.io/stealth?proxy=residential","provider-secret")).toBe("wss://production-sfo.browserless.io/stealth?proxy=residential&token=provider-secret");
  for(const endpoint of ["ws://production-sfo.browserless.io","wss://127.0.0.1/stealth","wss://browserless.io.evil.test/stealth","wss://user:pass@production-sfo.browserless.io/stealth","wss://production-sfo.browserless.io/stealth?token=already"]){
    expect(()=>browserlessCdpUrl(endpoint,"provider-secret")).toThrow("remote browser endpoint invalid");
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
