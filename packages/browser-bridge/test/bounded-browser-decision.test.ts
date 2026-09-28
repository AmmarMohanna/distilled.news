import {describe,expect,it} from "vitest";
import {advancePublicDiscovery} from "../src/bounded-browser-decision";
import {MockBrowserProvider,baseCapability} from "./support";
import type {BrowserAllocation,BrowserObservationData} from "@distilled/agent-runtime";

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
});
