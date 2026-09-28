import { describe, expect, it } from "vitest";
import { MemorySourceHighWaterStore, type SourceAcquisitionRequest, type SourceAcquisitionResult } from "../src/temporal-acquisition";
import { ProductionSourceAcquisitionService } from "../src/production-source-acquisition-service";
const input={tenantId:"tenant",ownerId:"owner",resourceId:"resource",source:{canonicalSourceUrl:"https://source.example.test/"},window:{startTime:"2026-09-20T00:00:00Z",endTime:"2026-09-22T00:00:00Z"},limits:{maxItems:2,maxPages:2,maxScrolls:1,maxPhysicalAttempts:1,maxExecutionMs:1000},acquisitionAsOf:"2026-09-23T00:00:00Z"};
const result=(covered=true)=>({items:[],requestedWindow:input.window,effectiveWindow:input.window,acquisitionAsOf:input.acquisitionAsOf,coverage:{rangeCovered:covered,truncated:!covered,stopReason:covered?"SOURCE_EXHAUSTED":"SOURCE_PAGINATION_EXHAUSTED"},continuation:{pageCount:1,scrollCount:0,noProgressCount:0,uniqueCanonicalIds:0,uniqueCanonicalUrls:0}} as SourceAcquisitionResult);
describe("production source acquisition service",()=>{it("routes HTTP success through temporal result and commits safe high-water",async()=>{const store=new MemorySourceHighWaterStore();const service=new ProductionSourceAcquisitionService({highWater:store,structured:async()=>({stage:"STRUCTURED",status:"UNSUPPORTED"}),http:async()=>({stage:"HTTP",status:"SUCCESS",result:result()})});const out=await service.acquire(input);expect(out.status).toBe("SUCCESS");expect(out.committedHighWater?.lastSuccessfulBoundary).toBe(input.window.endTime);});it("keeps retry state across incomplete runs",async()=>{const store=new MemorySourceHighWaterStore();await store.put({key:"tenant:resource",lastSuccessfulBoundary:"2026-09-20T00:00:00Z"});const service=new ProductionSourceAcquisitionService({highWater:store,structured:async()=>({stage:"STRUCTURED",status:"UNSUPPORTED"}),http:async()=>({stage:"HTTP",status:"SUCCESS",result:result(false)})});const out=await service.acquire(input);expect(out.committedHighWater?.lastSuccessfulBoundary).toBe("2026-09-20T00:00:00Z");expect(out.committedHighWater?.unresolvedWindow).toEqual(input.window);});it("stops policy denial without agent bypass",async()=>{let agent=0;const store=new MemorySourceHighWaterStore();const out=await new ProductionSourceAcquisitionService({highWater:store,structured:async()=>({stage:"STRUCTURED",status:"UNSUPPORTED"}),http:async()=>({stage:"HTTP",status:"POLICY_DENIED"}),webOperator:async()=>{agent++;throw Error()}}).acquire(input);expect(out.status).toBe("STOPPED");expect(out.stopReason).toBe("POLICY_DENIED");expect(agent).toBe(0);expect((await store.get("tenant:resource"))?.unresolvedWindow).toEqual(input.window);});});

describe("production discovery routing",()=>{
  it("does not advance coverage when durable item handoff fails and safely retries",async()=>{
    const highWater=new MemorySourceHighWaterStore();
    let fail=true,persisted=0;
    const service=new ProductionSourceAcquisitionService({highWater,structured:async()=>({stage:"STRUCTURED",status:"SUCCESS",result:result()}),persistItems:async()=>{expect((await highWater.get("tenant:resource"))?.lastSuccessfulBoundary).toBeUndefined();if(fail)throw Error("storage_unavailable");persisted++}});
    await expect(service.acquire(input)).rejects.toThrow("storage_unavailable");
    expect(await highWater.get("tenant:resource")).toEqual({key:"tenant:resource",unresolvedWindow:input.window});
    fail=false;
    const replay=await service.acquire(input);
    expect(persisted).toBe(1);
    expect(replay.committedHighWater?.lastSuccessfulBoundary).toBe(input.window.endTime);
    expect(replay.committedHighWater?.unresolvedWindow).toBeUndefined();
  });
  it.each([
    {name:"structured",structured:"SUCCESS",http:"UNSUPPORTED",active:false,expected:["structured"]},
    {name:"HTTP",structured:"INSUFFICIENT",http:"SUCCESS",active:false,expected:["structured","http"]},
    {name:"ACTIVE",structured:"INSUFFICIENT",http:"INSUFFICIENT",active:true,expected:["structured","http","lookup","workflow"]}
  ] as const)("skips Browser Use after $name succeeds",async({structured,http,active,expected})=>{
    const calls:string[]=[];
    const out=await new ProductionSourceAcquisitionService({
      highWater:new MemorySourceHighWaterStore(),
      structured:async()=>{calls.push("structured");return{stage:"STRUCTURED",status:structured,result:structured==="SUCCESS"?result():undefined}},
      http:async()=>{calls.push("http");return{stage:"HTTP",status:http,result:http==="SUCCESS"?result():undefined}},
      lookupActiveWorkflow:async()=>{calls.push("lookup");return active?{id:"active",version:1,execute:async()=>({stage:"BROWSER_WORKFLOW",status:"SUCCESS",result:result()})}:undefined},
      browserWorkflow:async(request,workflow)=>{calls.push("workflow");return workflow!.execute(request)},
      webOperator:async()=>{calls.push("browser_use");return{stage:"WEB_OPERATOR",status:"INSUFFICIENT"}}
    }).acquire(input);
    expect(out.status).toBe("SUCCESS");expect(out.webOperatorCalls).toBe(0);expect(calls).toEqual(expected);
  });
  it.each(["missing","broken"] as const)("makes Browser Use eligible for a $name workflow",async(state)=>{
    const calls:string[]=[];
    const out=await new ProductionSourceAcquisitionService({
      highWater:new MemorySourceHighWaterStore(),
      structured:async()=>({stage:"STRUCTURED",status:"INSUFFICIENT"}),
      http:async()=>({stage:"HTTP",status:"INSUFFICIENT"}),
      lookupActiveWorkflow:async()=>state==="broken"?{id:"active",version:1,execute:async()=>({stage:"BROWSER_WORKFLOW",status:"STRUCTURAL_FAILURE"})}:undefined,
      browserWorkflow:async(request,workflow)=>workflow!.execute(request),
      webOperator:async()=>{calls.push("browser_use");return{stage:"WEB_OPERATOR",status:"INSUFFICIENT"}}
    }).acquire(input);
    expect(out.status).toBe("STOPPED");expect(out.webOperatorCalls).toBe(1);expect(calls).toEqual(["browser_use"]);
  });
});
