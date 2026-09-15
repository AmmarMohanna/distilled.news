import { afterEach,describe,expect,it,vi } from "vitest";
import { WebOperatorAcquisitionStrategy,type KnownCandidateInvocation } from "../src/admission";
import type {
  BrowserAllocation,
  BrowserExecutorPort,
  BrowserObservationData,
  BrowserScope,
  ScreenshotData,
  StructuredBrowserUsePort,
  VisualComputerUsePort
} from "../src/browser";
import { DEFAULT_SLICE_BUDGET } from "../src/budget";
import type { InteractionCapability,SemanticControl } from "../src/contracts";
import { ModelGatewayError,type ModelGateway,type ModelGatewayResult,type ModelRequest } from "../src/model";
import { MemoryArtifactStore } from "../src/observations";
import { MemoryRuntimeStore,StaleGenerationError } from "../src/persistence";
import { WebOperatorCoordinator } from "../src/runtime";

describe("model operation deadlines and recovery",()=>{
  afterEach(()=>vi.useRealTimers());

  it("renews a short lease while a model operation continues under an independent timeout",async()=>{
    const startedAt=new Date("2026-09-14T20:00:00.000Z");
    vi.useFakeTimers({now:startedAt,toFake:["Date","setTimeout","setInterval"]});
    const store=new RenewalRecordingStore();
    const gateway=new DelayedFailureGateway(16_000);
    const {strategy,coordinator}=runtime(store,gateway,{leaseTtlMs:15_000,modelCallTimeoutMs:40_000,runSettlementReserveMs:5_000});
    const admitted=await strategy.admitKnownCandidate(invocation("lease-independent-timeout"),startedAt);
    const processing=coordinator.process(admitted.run.runId,"worker-a",startedAt);
    const outcome=processing.then(()=>null,(error:unknown)=>error);

    await flushUntil(()=>gateway.requests.length===1);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(await outcome).toMatchObject({failureClass:"deadline_exceeded"});

    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0].timeoutMs).toBe(40_000);
    expect(store.renewalCount).toBeGreaterThanOrEqual(3);
    expect((await store.getRun(admitted.run.runId))?.state).toBe("queued");
    const events=await store.listEvents(admitted.run.runId);
    const turnId=(events.find((event)=>event.type==="agent.turn.created")?.data as {id:string}).id;
    expect((await store.getTurn(turnId))?.state).toBe("failed");
    expect(events.filter((event)=>event.type.startsWith("agent.run.attempt_")).map((event)=>event.type))
      .toEqual(["agent.run.attempt_started","agent.run.attempt_completed"]);
    expect((await store.getOutbox(admitted.run.runId))?.state).toBe("pending");
    expect(events.find((event)=>event.type==="agent.model.attempt_failed")?.data).toMatchObject({
      failureClass:"deadline_exceeded",latencyMs:16_000,usageConfirmed:false,
      reservation:{inputTokens:1_000,outputTokens:500}
    });
  });

  it("clamps one physical model attempt to remaining run time minus settlement reserve",async()=>{
    const admittedAt=new Date("2026-09-14T20:00:00.000Z");
    const processAt=new Date(admittedAt.getTime()+50_000);
    vi.useFakeTimers({now:processAt,toFake:["Date","setTimeout","setInterval"]});
    const store=new MemoryRuntimeStore();
    const gateway=new DelayedFailureGateway(0);
    const {strategy,coordinator}=runtime(store,gateway,{leaseTtlMs:15_000,modelCallTimeoutMs:40_000,runSettlementReserveMs:5_000});
    const admitted=await strategy.admitKnownCandidate(invocation("remaining-run-clamp"),admittedAt);
    const processing=coordinator.process(admitted.run.runId,"worker-a",processAt);
    const outcome=processing.then(()=>null,(error:unknown)=>error);
    await flushUntil(()=>gateway.requests.length===1);
    await vi.advanceTimersByTimeAsync(0);
    expect(await outcome).toMatchObject({failureClass:"deadline_exceeded"});

    expect(gateway.requests[0].timeoutMs).toBe(5_000);
  });

  it("does not start another physical model attempt after the run deadline reserve is exhausted",async()=>{
    const admittedAt=new Date("2026-09-14T20:00:00.000Z");
    const processAt=new Date(admittedAt.getTime()+55_001);
    vi.useFakeTimers({now:processAt,toFake:["Date","setTimeout","setInterval"]});
    const store=new MemoryRuntimeStore();
    const gateway=new DelayedFailureGateway(0);
    const browser=new RuntimeBrowserDouble();
    const strategy=new WebOperatorAcquisitionStrategy(store);
    const coordinator=new WebOperatorCoordinator({
      store,artifacts:new MemoryArtifactStore(),browserExecutor:browser,structured:browser,visual:browser,modelGateway:gateway,strategy,
      leaseTtlMs:15_000,modelCallTimeoutMs:40_000,runSettlementReserveMs:5_000
    });
    const admitted=await strategy.admitKnownCandidate(invocation("expired-run-deadline"),admittedAt);

    await expect(coordinator.process(admitted.run.runId,"worker-a",processAt)).rejects.toMatchObject({dimension:"wallClockMs"});

    expect(gateway.requests).toHaveLength(0);
    expect(browser.allocations).toBe(0);
    expect((await store.getRun(admitted.run.runId))?.state).toBe("failed");
  });

  it("cancels on lease renewal failure without settling a late model response",async()=>{
    const startedAt=new Date("2026-09-14T20:00:00.000Z");
    vi.useFakeTimers({now:startedAt,toFake:["Date","setTimeout","setInterval"]});
    const store=new RenewalFailureStore();
    const gateway=new StubbornGateway(20_000);
    const {strategy,coordinator}=runtime(store,gateway,{leaseTtlMs:15_000,modelCallTimeoutMs:40_000,runSettlementReserveMs:5_000});
    const admitted=await strategy.admitKnownCandidate(invocation("lease-loss-fencing"),startedAt);
    const processing=coordinator.process(admitted.run.runId,"worker-a",startedAt);
    const outcome=processing.then(()=>null,(error:unknown)=>error);

    await flushUntil(()=>gateway.requests.length===1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await outcome).toMatchObject({name:"LeaseRenewalLostError"});

    const events=await store.listEvents(admitted.run.runId);
    expect(events.some((event)=>event.type==="agent.model.attempt_completed")).toBe(false);
    expect(events.filter((event)=>event.type==="agent.model.attempt_started")).toHaveLength(1);
  });

  it("rejects model settlement after an authoritative generation change",async()=>{
    const startedAt=new Date("2026-09-14T20:00:00.000Z");
    vi.useFakeTimers({now:startedAt,toFake:["Date","setTimeout","setInterval"]});
    const store=new MemoryRuntimeStore();
    const gateway=new StubbornGateway(20_000);
    const {strategy,coordinator}=runtime(store,gateway,{leaseTtlMs:90_000,modelCallTimeoutMs:40_000,runSettlementReserveMs:5_000});
    const admitted=await strategy.admitKnownCandidate(invocation("generation-change-fencing"),startedAt);
    const processing=coordinator.process(admitted.run.runId,"worker-a",startedAt);
    const outcome=processing.then(()=>null,(error:unknown)=>error);

    await flushUntil(()=>gateway.requests.length===1);
    await vi.advanceTimersByTimeAsync(5_000);
    await store.failRunDelivery(admitted.run.runId,"authoritative queue quarantine",new Date(Date.now()).toISOString());
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toBeInstanceOf(StaleGenerationError);

    const events=await store.listEvents(admitted.run.runId);
    expect(events.some((event)=>event.type==="agent.model.attempt_completed")).toBe(false);
    expect((await store.getRun(admitted.run.runId))?.state).toBe("failed");
  });
});

class RenewalRecordingStore extends MemoryRuntimeStore {
  renewalCount=0;
  override async renewLease(...args:Parameters<MemoryRuntimeStore["renewLease"]>) {
    this.renewalCount+=1;
    return super.renewLease(...args);
  }
}

class RenewalFailureStore extends MemoryRuntimeStore {
  override async renewLease():Promise<never> { throw new Error("simulated lease renewal failure"); }
}

class DelayedFailureGateway implements ModelGateway {
  readonly id="delayed-deadline";
  readonly requests:ModelRequest[]=[];
  constructor(private readonly delayMs:number) {}
  async complete(request:ModelRequest):Promise<ModelGatewayResult> {
    this.requests.push(request);
    await new Promise<void>((resolve)=>setTimeout(resolve,this.delayMs));
    throw new ModelGatewayError(
      "openrouter transport failed: model gateway deadline exceeded",
      {inputTokens:0,outputTokens:0,costUsd:0,latencyMs:this.delayMs},
      {gateway:"openrouter",deployment:"api"},
      "deadline_exceeded",
      false
    );
  }
}

class StubbornGateway implements ModelGateway {
  readonly id="stubborn";
  readonly requests:ModelRequest[]=[];
  constructor(private readonly delayMs:number) {}
  async complete(request:ModelRequest):Promise<ModelGatewayResult> {
    this.requests.push(request);
    await new Promise<void>((resolve)=>setTimeout(resolve,this.delayMs));
    return {
      plan:{version:1,actions:[]},usage:{inputTokens:1,outputTokens:1,costUsd:0,latencyMs:this.delayMs},
      provider:"fixture",model:request.route.selectedModel,responseId:"late",gateway:this.id,deployment:"api"
    };
  }
}

class RuntimeBrowserDouble implements BrowserExecutorPort,StructuredBrowserUsePort,VisualComputerUsePort {
  allocations=0;
  async allocate(input:{runId:string;tenantId:string;generation:number}):Promise<BrowserAllocation> {
    this.allocations+=1;
    return {runId:input.runId,tenantId:input.tenantId,generation:input.generation,sessionId:"session",contextId:"context",pageId:"page",
      viewport:{width:960,height:720,deviceScaleFactor:1}};
  }
  async health() { return "healthy" as const; }
  async close() {}
  async crashForTest() {}
  async bindObservationCapabilities(_scope:BrowserScope,input:{controls:SemanticControl[]}) { return input.controls; }
  async navigate(_scope:BrowserScope,url:string) { return observation(url); }
  async inspectDom() { return observation("about:blank"); }
  async inspectAccessibilityTree() { return observation("about:blank"); }
  async followLink() { return observation("about:blank"); }
  async extract() { return observation("about:blank"); }
  async queryPageState() { return observation("about:blank"); }
  async scroll() { return observation("about:blank"); }
  async screenshot():Promise<ScreenshotData> { return {...observation("about:blank"),screenshotObservationToken:"token",viewport:{width:960,height:720,deviceScaleFactor:1}}; }
  async movePointer(_scope:BrowserScope,_input:{x:number;y:number;screenshotToken:string;pageRevision:string;capability:InteractionCapability}) { return observation("about:blank"); }
  async click(_scope:BrowserScope,_input:{x:number;y:number;screenshotToken:string;pageRevision:string;capability:InteractionCapability}) { return observation("about:blank"); }
  async issueVisualCapability() { return null; }
}

function runtime(store:MemoryRuntimeStore,gateway:ModelGateway,timing:{leaseTtlMs:number;modelCallTimeoutMs:number;runSettlementReserveMs:number}) {
  const browser=new RuntimeBrowserDouble();
  const strategy=new WebOperatorAcquisitionStrategy(store);
  return {strategy,coordinator:new WebOperatorCoordinator({
    store,artifacts:new MemoryArtifactStore(),browserExecutor:browser,structured:browser,visual:browser,modelGateway:gateway,strategy,...timing
  })};
}

function invocation(suffix:string):KnownCandidateInvocation {
  return {
    tenantId:`tenant-${suffix}`,resourceId:`resource-${suffix}`,idempotencyKey:`key-${suffix}`,objective:"Acquire public article",enabled:true,
    candidate:{candidateId:`candidate-${suffix}`,canonicalUrl:"https://fixture.test/article",publisherId:"fixture",acquisitionAttempt:`attempt-${suffix}`},
    policy:{id:`policy-${suffix}`,allowedOrigins:["https://fixture.test"],allowLoopback:false,allowedTools:["browser.navigate@1"],visualReadPurposes:[],
      modelPolicy:{allowedProviders:["fixture"],allowedDeployments:["api"],requiredPrivacyEligibility:["public"],allowedRetentionClasses:["zero_data_retention"]}},
    modelRouting:{mode:"api",apiGateway:"openrouter",selfHostedGateway:"openai_compatible",roles:{
      NAVIGATION_FAST:{primary:{deployment:"api",model:"fixture/fast"},fallbacks:[]}
    }},
    modelCapabilities:[{modelRef:"fixture/fast",provider:"fixture",deployment:"api",externallyHosted:true,privacyEligibility:["public"],retentionClass:"zero_data_retention",
      toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:1,outputCostPerMillion:1}],
    budgetLimits:{...DEFAULT_SLICE_BUDGET,wallClockMs:60_000}
  };
}

function observation(url:string):BrowserObservationData {
  return {url,finalUrl:url,title:"",pageId:"page",pageRevision:"revision",contentType:"application/json",raw:new Uint8Array(),representation:{},
    observationSource:"CDP_DOM_SNAPSHOT",protocolSnapshotVersion:"test",controls:[],challengeState:"NO_CHALLENGE",watermarkObserved:false};
}

async function flushUntil(predicate:()=>boolean) {
  for (let index=0;index<500&&!predicate();index+=1) await new Promise<void>((resolve)=>setImmediate(resolve));
  expect(predicate()).toBe(true);
}
