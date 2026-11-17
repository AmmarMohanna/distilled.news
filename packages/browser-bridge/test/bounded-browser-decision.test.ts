import {describe,expect,it,vi} from "vitest";
import {advancePublicDiscovery} from "../src/bounded-browser-decision";
import {MockBrowserProvider,baseCapability} from "./support";
import {bridgeRequestFingerprint,type BrowserAllocation,type BrowserObservationData} from "@distilled/agent-runtime";

const url="https://news.example/listing",item="https://news.example/article/a";
const observation={url,title:"Listing",pageRevision:"rev_1",representation:{visibleText:"listing"},controls:[],listingLinks:[item],challengeState:"NO_CHALLENGE"} as unknown as BrowserObservationData;
const scope={generation:1} as BrowserAllocation;
const capability=baseCapability({siteKind:"PUBLIC",authEntryPoint:url,allowedOrigins:["https://news.example"],writeOrigins:[]});
describe("fenced Jev browser micro-decisions",()=>{
  it("executes only an observed target through the existing browser authority",async()=>{
    class Provider extends MockBrowserProvider{override async observePublicPage(){return observation} override async navigatePublicPage(_scope:unknown,target:string){expect(target).toBe(item);return{...observation,url:target}}}
    const result=await advancePublicDiscovery({provider:new Provider(),scope,capability,pageRevision:"rev_1",inspected:new Set(),decisionProvider:{choose:async()=>({choiceId:"choice_3",confidence:1,probabilities:{choice_3:1},provider:"test",model:"test"})}});
    expect(result.action).toBe("OPEN_OBSERVED_ITEM");expect(result.observation?.url).toBe(item);
  });
  it("rejects a stale revision after the provider responds, and falls back on illegal choices",async()=>{
    let calls=0;
    class Provider extends MockBrowserProvider{override async observePublicPage(){return{...observation,pageRevision:++calls===1?"rev_1":"rev_2"}}}
    await expect(advancePublicDiscovery({provider:new Provider(),scope,capability,pageRevision:"rev_1",inspected:new Set(),decisionProvider:{choose:async()=>({choiceId:"choice_3",confidence:1,probabilities:{choice_3:1},provider:"test",model:"test"})}})).rejects.toMatchObject({code:"BRIDGE_OBSERVATION_STALE"});
    calls=0;
    expect(await advancePublicDiscovery({provider:new Provider(),scope,capability,pageRevision:"rev_1",inspected:new Set(),decisionProvider:{choose:async()=>({choiceId:"https://metadata.google.internal",confidence:1,probabilities:{},provider:"test",model:"test"})}})).toEqual({fallback:true});
  });
  it("cancels before action execution and records denied execution without weakening network policy",async()=>{
    const navigate=vi.fn(async()=>{throw Object.assign(new Error("denied"),{code:"BRIDGE_NETWORK_POLICY_DENIED"})});
    class Provider extends MockBrowserProvider{override async observePublicPage(){return observation}override navigatePublicPage=navigate}
    const recordOutcome=vi.fn(async()=>undefined);
    const choose=async()=>({choiceId:"choice_3",confidence:1,probabilities:{choice_3:1},provider:"test",model:"test"});
    const controller=new AbortController();controller.abort();
    expect(await advancePublicDiscovery({provider:new Provider(),scope,capability,pageRevision:"rev_1",inspected:new Set(),signal:controller.signal,decisionProvider:{choose}})).toEqual({fallback:true});
    expect(navigate).not.toHaveBeenCalled();
    await expect(advancePublicDiscovery({provider:new Provider(),scope,capability,pageRevision:"rev_1",inspected:new Set(),decisionProvider:{choose,recordOutcome}})).rejects.toMatchObject({code:"BRIDGE_NETWORK_POLICY_DENIED"});
    expect(recordOutcome).toHaveBeenCalledWith(expect.anything(),expect.anything(),"EXECUTION_FAILED");
  });
  it("binds mutation idempotency to the observation revision",()=>{
    const message={protocol:"v1" as const,operation:"ADVANCE_PUBLIC_DISCOVERY" as const,capability,operationId:"id",pageRevision:"rev_1"};
    expect(bridgeRequestFingerprint(message)).not.toBe(bridgeRequestFingerprint({...message,pageRevision:"rev_2"}));
  });
});
