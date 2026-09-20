import type {Server} from "node:http";
import type {AddressInfo} from "node:net";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {BRIDGE_PREFLIGHT_STAGES,runBridgePreflight,type BridgePreflightStage} from "@distilled/agent-runtime";
import {AuthenticatedBrowserBridgeService} from "../src/service";
import {createBridgeHttpServer} from "../src/server";
import {SYNTHETIC_IDENTIFIER,SYNTHETIC_PASSWORD,SyntheticSite} from "./synthetic-site";

const SECRET="preflight_test_bridge_secret_32bytes_!!";

/** The production preflight function, run against a real HTTP bridge, real Chromium and the shared synthetic sites. */
describe("production bridge preflight (all stages, local)",()=>{
  const site=new SyntheticSite();let service:AuthenticatedBrowserBridgeService;let server:Server;let url:string;
  const run=(stage:BridgePreflightStage)=>runBridgePreflight({url,serviceCredential:SECRET,allowLoopbackHttp:true},{stage,siteOrigin:site.origin,markers:{identifier:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD},idleWaitMs:1_500});

  beforeAll(async()=>{
    await site.start();service=new AuthenticatedBrowserBridgeService({serviceCredential:SECRET,allowTestMode:true,idleTimeoutMs:600});server=createBridgeHttpServer(service);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/authenticated-browser`;
  });
  afterAll(async()=>{await service.shutdown();await new Promise<void>(resolve=>server.close(()=>resolve()));await site.stop()});

  for(const stage of BRIDGE_PREFLIGHT_STAGES)it(`stage ${stage} passes with every check green`,async()=>{
    const result=await run(stage);
    expect(result.protocol).toBe("v1");
    expect(result.checks.filter(check=>!check.pass),JSON.stringify(result.checks.filter(check=>!check.pass))).toEqual([]);
    expect(result.pass).toBe(true);expect(result.checks.length).toBeGreaterThan(1);
    const rendered=JSON.stringify(result);expect(rendered).not.toContain(SYNTHETIC_IDENTIFIER);expect(rendered).not.toContain(SYNTHETIC_PASSWORD);expect(rendered).not.toContain(SECRET);
  },120_000);

  it("proved the redirect scenarios independently: the foreign server received zero requests and never saw the marker",()=>{
    expect(site.otherHits).toBe(0);
  });

  it("refuses non-synthetic markers and non-HTTPS sites",async()=>{
    await expect(runBridgePreflight({url,serviceCredential:SECRET},{stage:"AUTH_PROTOCOL",siteOrigin:"https://example.test",markers:{identifier:"real-user",password:"TEST_x"}})).rejects.toThrow(/synthetic/);
    await expect(runBridgePreflight({url,serviceCredential:SECRET},{stage:"AUTH_PROTOCOL",siteOrigin:"http://example.test",markers:{identifier:"TEST_a",password:"TEST_b"}})).rejects.toThrow(/HTTPS/);
  });

  it("reports failure (not a false pass) when the credential is wrong",async()=>{
    const result=await runBridgePreflight({url,serviceCredential:`${SECRET}-wrong`,allowLoopbackHttp:true},{stage:"LIFECYCLE",siteOrigin:site.origin,markers:{identifier:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD}});
    expect(result.pass).toBe(false);
  },60_000);
});
