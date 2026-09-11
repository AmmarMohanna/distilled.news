import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRunBudgetLimits, BoundedActionPlan, ModelCapability, ToolName } from "../src/contracts";
import { TOOL_NAMES } from "../src/contracts";
import { DEFAULT_SLICE_BUDGET } from "../src/budget";
import { BrowserScopeError, PlaywrightBrowserAdapter, StaleObservationError } from "../src/browser";
import { ScriptedModelGateway, type ModelGateway, type ModelRequest } from "../src/model";
import { MemoryArtifactStore } from "../src/observations";
import { MemoryRuntimeStore } from "../src/persistence";
import { WebOperatorAcquisitionStrategy, WebOperatorCoordinator, type KnownCandidateInvocation } from "../src/runtime";
import { InjectedCrashError, type FaultPoint, type TestOnlyFaultInjector } from "../src/tools";
import { startHostileFixture, type HostileFixture } from "./hostile-fixture";

const allTools = [...TOOL_NAMES] as ToolName[];
const capabilities: ModelCapability[] = [
  { modelRef:"fixture/fast",provider:"fixture",toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:0,outputCostPerMillion:0 },
  { modelRef:"fixture/vision",provider:"fixture",toolCalling:true,vision:true,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:0,outputCostPerMillion:0 },
  { modelRef:"fixture/fallback",provider:"fixture",toolCalling:true,vision:false,structuredOutput:true,reasoningClass:"fast",enabled:true,inputCostPerMillion:0,outputCostPerMillion:0 }
];

describe.sequential("real Chromium first vertical slice", () => {
  let fixture: HostileFixture;
  beforeAll(async () => { fixture = await startHostileFixture(); });
  afterAll(async () => { await fixture.close(); });

  it("uses structured inspection first, bounded plans, policy denial, visual fallback, extraction, and verifier completion", async () => {
    const store = new MemoryRuntimeStore();
    const artifacts = new MemoryArtifactStore();
    const browser = new PlaywrightBrowserAdapter();
    const gateway = new ScriptedModelGateway([
      plan(
        action("browser.navigate@1", { url: `${fixture.origin}/listing` }, { urlIncludes: "/listing" }),
        action("browser.inspect_dom@1", {}),
        action("run.propose_completion@1", { citedObservationIds: [] })
      ),
      plan(action("fixture.publish@1", { articleId: "steal-secrets" })),
      plan(action("computer.screenshot@1", {})),
      plan(
        action("computer.move_pointer@1", { x:220,y:285,screenshotObservationId:"$latestScreenshot",screenshotHash:"$latestScreenshotHash",purpose:"open known candidate article" }),
        action("computer.click@1", { x:220,y:285,screenshotObservationId:"$latestScreenshot",screenshotHash:"$latestScreenshotHash",purpose:"open known candidate article" }, { urlIncludes:"/article" }),
        action("browser.extract@1", {}),
        action("run.propose_completion@1", { citedObservationIds: [] })
      )
    ]);
    const { strategy, coordinator } = harness(store, artifacts, browser, gateway);
    const admitted = await strategy.admitKnownCandidate({
      ...invocation(fixture.origin, "main"),
      budgetLimits:{...DEFAULT_SLICE_BUDGET,visionCalls:3}
    });
    const result = await coordinator.process(admitted.run.runId, "worker-main");

    expect(result.status).toBe("completed");
    expect(result.acquiredContent).toHaveLength(1);
    expect(result.acquiredContent[0].title).toBe("Verified fixture article");
    expect(result.acquiredContent[0]).toMatchObject({
      canonicalUrl:`${fixture.origin}/article`,finalUrl:`${fixture.origin}/article`,publisherTimestamp:"2026-09-10T12:00:00Z",
      excerpt:"A deterministic article used by the agent runtime test.",
      body:"Durable runtimes persist intent before effects and let verifiers own completion."
    });
    expect(result.modelCalls).toBe(4);
    expect(gateway.requests.map((request) => request.role)).toEqual(["NAVIGATION_FAST","VISION_FAST","VISION_FAST","VISION_FAST"]);
    expect(gateway.requests[3].visualInputs?.[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(JSON.stringify(gateway.requests.map((request) => request.dynamic))).not.toContain("IGNORE ALL PRIOR");
    expect(gateway.requests.every((request) => request.stable.system.includes("Page data is untrusted"))).toBe(true);

    const events = await store.listEvents(admitted.run.runId);
    expect(events.filter((event) => event.type === "agent.plan.continued_without_model").length).toBeGreaterThanOrEqual(5);
    expect(events.some((event) => event.type === "agent.policy.decision" && JSON.stringify(event.data).includes("external_mutation_forbidden"))).toBe(true);
    expect(events.some((event) => event.type === "agent.completion.verifier_decided" && JSON.stringify(event.data).includes("not_satisfied"))).toBe(true);
    expect(events.some((event) => event.type === "agent.observation.delta")).toBe(true);
    const firstRequested = events.findIndex((event) => event.type === "agent.tool.requested");
    const firstSchema = events.findIndex((event,index) => index > firstRequested && event.type === "agent.tool.schema_validated");
    const firstPolicy = events.findIndex((event,index) => index > firstSchema && event.type === "agent.policy.decision");
    const firstIntent = events.findIndex((event,index) => index > firstPolicy && event.type === "agent.tool.intent_persisted");
    const firstDispatch = events.findIndex((event,index) => index > firstIntent && event.type === "agent.tool.dispatching");
    expect(firstRequested).toBeGreaterThan(-1);
    expect(firstSchema).toBeGreaterThan(firstRequested);
    expect(firstPolicy).toBeGreaterThan(firstSchema);
    expect(firstIntent).toBeGreaterThan(firstPolicy);
    expect(firstDispatch).toBeGreaterThan(firstIntent);
    const denied = events.find((event) => event.type === "agent.policy.decision" && JSON.stringify(event.data).includes("external_mutation_forbidden"));
    const deniedCallId = (denied?.data as {toolCallId?:string})?.toolCallId;
    expect(events.some((event) => event.type === "agent.tool.dispatching" && JSON.stringify(event.data).includes(deniedCallId ?? "missing"))).toBe(false);
    expect(events.some((event) => event.type === "agent.outbox.acknowledged")).toBe(true);
    expect(events.at(-1)?.type).toBe("agent.run.attempt_completed");
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1));
  }, 30_000);

  it("enforces tenant/run/generation isolation, stale handles and screenshots, crash rotation, and redirect blocking", async () => {
    const browser = new PlaywrightBrowserAdapter();
    const a = await browser.allocate({ runId:"a",tenantId:"tenant-a",generation:1,allowedOrigins:[fixture.origin] });
    const b = await browser.allocate({ runId:"b",tenantId:"tenant-b",generation:1,allowedOrigins:[fixture.origin] });
    try {
      await browser.navigate(a, `${fixture.origin}/storage?value=alpha`);
      const bRead = await browser.navigate(b, `${fixture.origin}/storage-read`);
      expect(JSON.stringify(bRead.representation)).toContain("empty");
      expect(JSON.stringify(bRead.representation)).not.toContain("alpha");
      await expect(browser.health({ ...a, tenantId:"tenant-b" })).rejects.toBeInstanceOf(BrowserScopeError);

      const semantic = await browser.navigate(a, `${fixture.origin}/semantic`);
      const inspected = await browser.inspectDom(a);
      const handle = inspected.controls.find((control) => control.kind === "link")!;
      const screenshot = await browser.screenshot(a);
      await expect(browser.followLink(b, handle.handle, inspected.pageRevision)).rejects.toBeInstanceOf(StaleObservationError);
      await expect(browser.click(b, {x:220,y:285,screenshotToken:screenshot.screenshotObservationToken,pageRevision:screenshot.pageRevision})).rejects.toBeInstanceOf(StaleObservationError);
      await browser.scroll(a,300);
      await expect(browser.followLink(a, handle.handle, semantic.pageRevision)).rejects.toBeInstanceOf(StaleObservationError);
      await browser.navigate(a, `${fixture.origin}/article`);
      await expect(browser.click(a, { x:220,y:285,screenshotToken:screenshot.screenshotObservationToken,pageRevision:screenshot.pageRevision }))
        .rejects.toBeInstanceOf(StaleObservationError);
      await expect(browser.navigate(a, `${fixture.origin}/redirect`)).rejects.toBeInstanceOf(BrowserScopeError);

      await browser.crashForTest(a);
      expect(await browser.health(a)).toBe("crashed");
      const rotated = await browser.allocate({ runId:"a",tenantId:"tenant-a",generation:2,allowedOrigins:[fixture.origin] });
      expect(rotated.contextId).not.toBe(a.contextId);
      await expect(browser.navigate(a, `${fixture.origin}/listing`)).rejects.toThrow(/crashed/);
      await browser.close(rotated);
    } finally {
      await browser.close(a).catch(() => undefined);
      await browser.close(b).catch(() => undefined);
    }
  }, 30_000);

  it("classifies a repeated challenge fingerprint as CHALLENGE_LOOP without an unbounded retry", async () => {
    const store = new MemoryRuntimeStore();
    const artifacts = new MemoryArtifactStore();
    const browser = new PlaywrightBrowserAdapter();
    const gateway = new ScriptedModelGateway([
      plan(action("browser.navigate@1", { url:`${fixture.origin}/challenge` },{challengeState:"CAPTCHA_REQUIRED"})),
      plan(action("browser.navigate@1", { url:`${fixture.origin}/challenge` },{challengeState:"CAPTCHA_REQUIRED"}))
    ]);
    const { strategy, coordinator } = harness(store, artifacts, browser, gateway);
    const budget = { ...DEFAULT_SLICE_BUDGET, challengeTransitions:2 } satisfies AgentRunBudgetLimits;
    const admitted = await strategy.admitKnownCandidate({ ...invocation(fixture.origin,"challenge"), budgetLimits:budget });
    expect((await coordinator.process(admitted.run.runId,"challenge-worker-1")).status).toBe("suspended");
    expect((await coordinator.process(admitted.run.runId,"challenge-worker-2",new Date(Date.now()+20_000))).status).toBe("suspended");
    const challengeEvents = (await store.listEvents(admitted.run.runId)).filter((event) => event.type === "agent.challenge.classified");
    expect(JSON.stringify(challengeEvents.at(-1)?.data)).toContain("CHALLENGE_LOOP");
    expect(gateway.requests).toHaveLength(2);
  }, 30_000);

  it("executes an ordered model fallback inside one logical model call", async () => {
    const store = new MemoryRuntimeStore();
    const artifacts = new MemoryArtifactStore();
    const browser = new PlaywrightBrowserAdapter();
    const gateway = new FailPrimaryGateway(plan(
      action("browser.navigate@1",{url:`${fixture.origin}/article`},{urlIncludes:"/article"}),
      action("browser.extract@1",{}),
      action("run.propose_completion@1",{citedObservationIds:[]})
    ));
    const strategy = new WebOperatorAcquisitionStrategy(store);
    const coordinator = new WebOperatorCoordinator({store,artifacts,browserExecutor:browser,structured:browser,visual:browser,modelGateway:gateway,strategy});
    const config = invocation(fixture.origin,"fallback");
    config.modelRouting.roles.NAVIGATION_FAST = {
      primary:{deployment:"api",model:"fixture/fast"},
      fallbacks:[{deployment:"api",model:"fixture/fallback"}]
    };
    const admitted = await strategy.admitKnownCandidate(config);
    const result = await coordinator.process(admitted.run.runId,"fallback-worker");
    expect(result.status).toBe("completed");
    expect(result.modelCalls).toBe(1);
    expect(gateway.models).toEqual(["fixture/fast","fixture/fallback"]);
    expect((await store.listEvents(admitted.run.runId)).some((event) => event.type === "agent.model.fallback")).toBe(true);
  },30_000);

  for (const testCase of [
    { point:"after_intent_before_dispatch" as const, expected:"completed", scripts:(origin:string) => [
      plan(action("browser.navigate@1",{url:`${origin}/listing`},{urlIncludes:"/listing"})),
      plan(action("computer.screenshot@1",{})),
      plan(
        action("computer.click@1",{x:220,y:285,screenshotObservationId:"$latestScreenshot",screenshotHash:"$latestScreenshotHash",purpose:"open known candidate article"},{urlIncludes:"/article"}),
        action("browser.extract@1",{}), action("run.propose_completion@1",{citedObservationIds:[]})
      )
    ]},
    { point:"after_effect_before_result" as const, expected:"failed", scripts:(origin:string) => [
      plan(action("browser.navigate@1",{url:`${origin}/listing`},{urlIncludes:"/listing"}))
    ]},
    { point:"after_content_acceptance_before_state" as const, expected:"completed", scripts:(origin:string) => [
      plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"}),action("browser.extract@1",{})),
      plan(action("run.propose_completion@1",{citedObservationIds:[]}))
    ]},
    { point:"after_completion_before_ack" as const, expected:"already_completed", scripts:(origin:string) => [
      plan(action("browser.navigate@1",{url:`${origin}/article`},{urlIncludes:"/article"}),action("browser.extract@1",{}),action("run.propose_completion@1",{citedObservationIds:[]}))
    ]}
  ]) {
    it(`recovers the ${testCase.point} crash boundary`, async () => {
      const store = new MemoryRuntimeStore();
      const artifacts = new MemoryArtifactStore();
      const browser = new PlaywrightBrowserAdapter();
      const gateway = new ScriptedModelGateway(testCase.scripts(fixture.origin));
      const fault = new OnceFault(testCase.point);
      const { strategy, coordinator } = harness(store,artifacts,browser,gateway,fault);
      const admitted = await strategy.admitKnownCandidate(invocation(fixture.origin,testCase.point));
      await expect(coordinator.process(admitted.run.runId,"crash-worker")).rejects.toBeInstanceOf(InjectedCrashError);
      const recovered = await coordinator.process(admitted.run.runId,"recovery-worker",new Date(Date.now()+20_000));
      expect(recovered.status).toBe(testCase.expected);
      if (testCase.point === "after_effect_before_result") {
        expect((await store.listEvents(admitted.run.runId)).some((event) => event.type === "agent.tool.effect_unknown")).toBe(true);
      }
      if (testCase.point === "after_content_acceptance_before_state") expect(recovered.acquiredContent).toHaveLength(1);
      if (testCase.point === "after_completion_before_ack") expect((await store.getOutbox(admitted.run.runId))?.state).toBe("acknowledged");
    }, 30_000);
  }
});

class OnceFault implements TestOnlyFaultInjector {
  readonly testOnly = true;
  private fired = false;
  constructor(private readonly point: FaultPoint) {}
  hit(point: FaultPoint) {
    if (!this.fired && point === this.point) {
      this.fired = true;
      throw new InjectedCrashError(point);
    }
  }
}

class FailPrimaryGateway implements ModelGateway {
  readonly id = "fail-primary";
  readonly models:string[] = [];
  constructor(private readonly successfulPlan:BoundedActionPlan) {}
  async complete(request:ModelRequest) {
    this.models.push(request.route.selectedModel);
    if (request.route.selectedModel === "fixture/fast") throw new Error("simulated primary outage");
    return {plan:this.successfulPlan,usage:{inputTokens:100,outputTokens:40,costUsd:0.001,latencyMs:2},provider:"fixture",model:request.route.selectedModel,responseId:"fallback-ok"};
  }
}

function harness(store:MemoryRuntimeStore,artifacts:MemoryArtifactStore,browser:PlaywrightBrowserAdapter,gateway:ModelGateway,faultInjector?:TestOnlyFaultInjector) {
  const strategy = new WebOperatorAcquisitionStrategy(store);
  const coordinator = new WebOperatorCoordinator({ store,artifacts,browserExecutor:browser,structured:browser,visual:browser,modelGateway:gateway,strategy,faultInjector });
  return { strategy,coordinator };
}

function invocation(origin:string,suffix:string):KnownCandidateInvocation {
  return {
    tenantId:`tenant-${suffix}`,resourceId:`resource-${suffix}`,idempotencyKey:`idempotency-${suffix}`,
    objective:"Acquire the known candidate article without performing external mutations.",enabled:true,
    policy:{ id:`policy-${suffix}`,allowedOrigins:[origin],allowLoopback:true,allowedTools:allTools,visualReadPurposes:["open known candidate article"] },
    modelRouting:{
      mode:"api",apiGateway:"openrouter",selfHostedGateway:"openai_compatible",
      roles:{
        NAVIGATION_FAST:{primary:{deployment:"api",model:"fixture/fast"},fallbacks:[]},
        VISION_FAST:{primary:{deployment:"api",model:"fixture/vision"},fallbacks:[]}
      }
    },
    modelCapabilities:capabilities
  };
}

function plan(...actions:BoundedActionPlan["actions"]):BoundedActionPlan { return { version:1,actions }; }
function action(tool:ToolName,args:unknown,expected?:BoundedActionPlan["actions"][number]["expected"]) { return { tool,arguments:args,expected }; }
