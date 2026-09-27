import { describe,expect,it } from "vitest";
import { AuthenticatedBrowserBridgeService } from "../src/service";
import { MockBrowserProvider,baseCapability } from "./support";
import type { BrowserObservationData,BrowserScope } from "@distilled/agent-runtime";

class TimelineProvider extends MockBrowserProvider {
  sourceVisits:string[]=[];
  override async navigatePublicPage(_scope:BrowserScope,url:string,_allowedOrigins:string[]){this.sourceVisits.push(url);return observation(url)}
  override async observePublicPage(_scope:BrowserScope){return observation("https://x.com/source")}
  override async scroll(_scope:BrowserScope,_deltaY:number){return observation("https://x.com/source")}
}
function observation(url:string):BrowserObservationData{return{url,finalUrl:url,title:"X profile",pageId:"page",pageRevision:"revision-1",contentType:"application/vnd.distilled.cdp-snapshot+json",raw:new Uint8Array(),representation:{visibleText:"Timeline"},controls:[],listingLinks:[],challengeState:"NO_CHALLENGE",watermarkObserved:false,observationSource:"CDP_DOM_SNAPSHOT",protocolSnapshotVersion:"cdp-dom-snapshot-v1",timelinePosts:[{sourceItemId:"1234567890",canonicalItemUrl:"https://x.com/source/status/1234567890",publishedAt:"2026-09-27T10:00:00Z",text:"Trusted post"}]}}

describe("fenced authenticated source ingress",()=>{
  it("requires restored runtime session and admits only an X profile read path",async()=>{
    const provider=new TimelineProvider();const service=new AuthenticatedBrowserBridgeService({serviceCredential:"test-secret",provider});
    const capability=baseCapability({siteKind:"x",authEntryPoint:"https://x.com/login",sessionProbeUrl:"https://x.com/home",allowedOrigins:["https://x.com"],writeOrigins:["https://x.com"]});
    const post=async(operation:Record<string,unknown>)=>await (await service.handleInternal(new Request("http://container/v1/internal-authenticated-browser",{method:"POST",body:JSON.stringify({protocol:"v1",operationId:crypto.randomUUID(),capability,...operation})}))).json() as {ok:boolean;error?:{code:string};result?:{timelinePosts?:unknown[]}};
    try{
      expect((await post({operation:"OPEN_AUTH_BROWSER"})).ok).toBe(true);
      expect((await post({operation:"NAVIGATE_AUTH_SOURCE",sourceUrl:"https://x.com/source"})).error?.code).toBe("BRIDGE_FENCE_MISMATCH");
      expect((await post({operation:"DISCOVER_AUTH_SOURCE_WITH_BROWSER_USE",sourceUrl:"https://x.com/source",modelRef:"openai/test",maxSteps:4})).error?.code).toBe("BRIDGE_FENCE_MISMATCH");
      expect((await post({operation:"RESTORE_AUTH_STATE",state:{cookies:[],origins:[]}})).ok).toBe(true);
      expect((await post({operation:"NAVIGATE_AUTH_SOURCE",sourceUrl:"https://x.com/source"})).result?.timelinePosts).toHaveLength(1);
      expect((await post({operation:"SCROLL_AUTH_SOURCE",deltaY:900})).result?.timelinePosts).toHaveLength(1);
      expect(provider.sourceVisits).toEqual(["https://x.com/source"]);
      expect((await post({operation:"NAVIGATE_AUTH_SOURCE",sourceUrl:"https://x.com/messages"})).error?.code).toBe("BRIDGE_NETWORK_POLICY_DENIED");
      expect(provider.sourceVisits).toEqual(["https://x.com/source"]);
      expect((await post({operation:"CLOSE_AUTH_BROWSER"})).ok).toBe(true);
    } finally { await service.shutdown(); }
  });
  it.each(["http://127.0.0.1/source","https://[::1]/source","https://metadata.google.internal/source","https://unrelated.example/source","https://x.com/source/status/1234567890","https://x.com/messages"])("denies non-profile destination %s before navigation",async url=>{
    const provider=new TimelineProvider();const service=new AuthenticatedBrowserBridgeService({serviceCredential:"test-secret",provider});
    const capability=baseCapability({siteKind:"x",authEntryPoint:"https://x.com/login",sessionProbeUrl:"https://x.com/home",allowedOrigins:["https://x.com"],writeOrigins:["https://x.com"]});
    const post=async(operation:Record<string,unknown>)=>await (await service.handleInternal(new Request("http://container/v1/internal-authenticated-browser",{method:"POST",body:JSON.stringify({protocol:"v1",operationId:crypto.randomUUID(),capability,...operation})}))).json() as {ok:boolean;error?:{code:string}};
    try{await post({operation:"OPEN_AUTH_BROWSER"});await post({operation:"RESTORE_AUTH_STATE",state:{cookies:[],origins:[]}});
      expect((await post({operation:"NAVIGATE_AUTH_SOURCE",sourceUrl:url})).error?.code).toBe("BRIDGE_NETWORK_POLICY_DENIED");
      expect(provider.sourceVisits).toEqual([]);
    }finally{await service.shutdown()}
  });
});
