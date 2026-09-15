import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClosedLoopWebOperatorLifecycle,
  DEFAULT_SLICE_BUDGET,
  LocalPlaywrightBrowserExecutor,
  MemoryAcquisitionFailureRepository,
  MemoryArtifactStore,
  MemoryRuntimeStore,
  MemoryWorkflowRepository,
  makeId,
  type BoundedActionPlan,
  type ClosedLoopAcquisitionRequest,
  type DeterministicAcquisitionPort,
  type ModelCapability,
  type ModelGateway,
  type ModelRequest,
  type WorkflowCaptureBundle,
  type WorkflowCandidate,
  type WorkflowFailureEvidence,
  type WorkflowLifecycleState,
  type WorkflowRepository,
  type WorkflowValidationResult
} from "../src";

const lifecycleAt = (offsetMs: number) => new Date(Date.now() + offsetMs);

describe("closed-loop Web Operator lifecycle", () => {
  let fixture: VersionedPublisherFixture | undefined;
  afterEach(async () => { await fixture?.close(); fixture = undefined; });

  it("honors configured deterministic acquisition routes before Web Operator escalation", async () => {
    fixture = await startVersionedPublisherFixture();
    const store = new MemoryRuntimeStore();
    const workflowStore = new MemoryWorkflowRepository();
    const artifacts = new MemoryArtifactStore();
    const browser = LocalPlaywrightBrowserExecutor.forTest();
    const routeExecutions: string[] = [];
    const deterministicRoute: DeterministicAcquisitionPort = {
      method: "structured_api_feed",
      async acquire(acquisitionRequest, now) {
        routeExecutions.push(acquisitionRequest.candidate.canonicalUrl);
        return {
          state: "completed",
          acquiredContent: acquiredContent(acquisitionRequest, now.toISOString())
        };
      }
    };
    const controller = new ClosedLoopWebOperatorLifecycle({
      runtimeStore: store,
      workflowStore,
      artifacts,
      browserExecutor: browser,
      structured: browser,
      visual: browser,
      modelGateway: new VersionedPublisherGateway(fixture.origin),
      softwareVersion: "test-runtime",
      toolSchemaVersion: "web-operator-tools-v1",
      deterministicAcquisition: {
        structured_api_feed: deterministicRoute
      }
    });

    const routed = await controller.acquire(request(fixture.origin, "structured-route", "article-v1"), lifecycleAt(0));
    expect(routed.state).toBe("acquired_by_deterministic_route");
    if (routed.state !== "acquired_by_deterministic_route") throw new Error("expected deterministic acquisition route");
    expect(routed.modelCalls).toBe(0);
    expect(routed.routeDecision).toMatchObject({ method: "structured_api_feed", reason: "no_prior_failure" });
    expect(routeExecutions).toEqual([`${fixture.origin}/article-v1`]);
    expect(await workflowStore.listWorkflowCandidates("resource-closed-loop")).toHaveLength(0);
  }, 60_000);

  it("persists deterministic route failures and authorizes Web Operator fallback through AcquisitionRouter", async () => {
    fixture = await startVersionedPublisherFixture();
    const store = new MemoryRuntimeStore();
    const workflowStore = new MemoryWorkflowRepository();
    const acquisitionFailures = new MemoryAcquisitionFailureRepository();
    const artifacts = new MemoryArtifactStore();
    const browser = LocalPlaywrightBrowserExecutor.forTest();
    const gateway = new VersionedPublisherGateway(fixture.origin);
    const failingRoute: DeterministicAcquisitionPort = {
      method: "structured_api_feed",
      async acquire(_request, now) {
        return {
          state: "failed",
          failureClass: "source_unavailable",
          transient: false,
          details: { checkedAt: now.toISOString() }
        };
      }
    };

    const firstController = closedLoopController({
      store,
      workflowStore,
      acquisitionFailures,
      artifacts,
      browser,
      gateway,
      deterministicAcquisition: { structured_api_feed: failingRoute }
    });
    const first = await firstController.acquire(request(fixture.origin, "feed-failure", "article-v1"), lifecycleAt(0));
    expect(first.state).toBe("waiting_for_deterministic_route_evidence");
    if (first.state !== "waiting_for_deterministic_route_evidence") throw new Error("expected first structural evidence only");
    expect(first.routeDecision).toMatchObject({ method: "structured_api_feed", reason: "waiting_for_bounded_structural_evidence" });

    const secondController = closedLoopController({
      store,
      workflowStore,
      acquisitionFailures,
      artifacts,
      browser,
      gateway,
      deterministicAcquisition: { structured_api_feed: failingRoute }
    });
    const second = await secondController.acquire(request(fixture.origin, "feed-failure", "article-v1"), lifecycleAt(60_000));
    expect(second.state).toBe("waiting_for_deterministic_route_evidence");
    if (second.state !== "waiting_for_deterministic_route_evidence") throw new Error("expected HTTP route escalation after feed evidence");
    expect(second.routeDecision).toMatchObject({
      method: "http_deterministic_extraction",
      escalatedFrom: "structured_api_feed"
    });

    const thirdController = closedLoopController({
      store,
      workflowStore,
      acquisitionFailures,
      artifacts,
      browser,
      gateway,
      deterministicAcquisition: { structured_api_feed: failingRoute }
    });
    const third = await thirdController.acquire(request(fixture.origin, "http-missing", "article-v1"), lifecycleAt(120_000));
    expect(third.state).toBe("waiting_for_deterministic_route_evidence");
    if (third.state !== "waiting_for_deterministic_route_evidence") throw new Error("expected bounded HTTP failure evidence");
    expect(third.routeDecision).toMatchObject({
      method: "http_deterministic_extraction",
      reason: "waiting_for_bounded_structural_evidence"
    });

    const fourthController = closedLoopController({
      store,
      workflowStore,
      acquisitionFailures,
      artifacts,
      browser,
      gateway,
      deterministicAcquisition: { structured_api_feed: failingRoute }
    });
    const fallback = await fourthController.acquire(request(fixture.origin, "agent-after-deterministic-failure", "article-v1"), lifecycleAt(180_000));
    expect(fallback.state).toBe("acquired_by_agent");
    if (fallback.state !== "acquired_by_agent") throw new Error("expected Web Operator fallback after persisted failures");
    expect(fallback.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v1`);
    expect(fallback.workflow).toMatchObject({ state: "ACTIVE", version: 1 });
    expect(await acquisitionFailures.listAcquisitionFailures({
      tenantId: "tenant",
      resourceId: "resource-closed-loop",
      candidateId: "candidate-article-v1"
    })).toHaveLength(4);
  }, 60_000);

  it("resumes automatic discovery finalization across durable workflow boundaries without duplicating artifacts", async () => {
    fixture = await startVersionedPublisherFixture();
    for (const boundary of ["capture", "candidate", "validation", "promotion"] as const) {
      const store = new MemoryRuntimeStore();
      const backingWorkflowStore = new MemoryWorkflowRepository();
      const workflowStore = new FailOnceWorkflowRepository(backingWorkflowStore, boundary);
      const artifacts = new MemoryArtifactStore();
      const browser = LocalPlaywrightBrowserExecutor.forTest();
      const gateway = new VersionedPublisherGateway(fixture.origin);
      const acquisitionRequest = request(fixture.origin, `restart-${boundary}`, "article-v1");

      const interruptedController = closedLoopController({
        store,
        workflowStore,
        artifacts,
        browser,
        gateway
      });
      await expect(interruptedController.acquire(acquisitionRequest, lifecycleAt(0)))
        .rejects.toThrow(new RegExp(boundary));
      const modelCallsAfterInterruptedRun = gateway.calls;

      const recoveryController = closedLoopController({
        store,
        workflowStore,
        artifacts,
        browser,
        gateway
      });
      const recovered = await recoveryController.acquire(acquisitionRequest, lifecycleAt(60_000));
      if (boundary === "promotion") {
        expect(recovered.state).toBe("acquired_by_workflow");
      } else {
        expect(recovered.state).toBe("acquired_by_agent");
        if (recovered.state !== "acquired_by_agent") throw new Error("expected recovered agent acquisition");
        expect(recovered.process.status).toBe("already_completed");
      }
      expect(gateway.calls).toBe(modelCallsAfterInterruptedRun);
      expect(await backingWorkflowStore.listWorkflowCandidates("resource-closed-loop")).toHaveLength(1);
      expect((await backingWorkflowStore.listWorkflowCandidates("resource-closed-loop")).filter((workflow) => workflow.state === "ACTIVE")).toHaveLength(1);
      const resumedRun = await store.getRunByIdempotencyKey("tenant", "resource-closed-loop", acquisitionRequest.idempotencyKey);
      expect(resumedRun).not.toBeNull();
      expect((await store.listEvents(resumedRun!.runId)).filter((event) => event.type === "agent.outbox.delivered"))
        .toHaveLength(1);

      const repeated = await recoveryController.acquire(acquisitionRequest, lifecycleAt(120_000));
      expect(repeated.state).toBe("acquired_by_workflow");
      expect(await backingWorkflowStore.listWorkflowCandidates("resource-closed-loop")).toHaveLength(1);
    }
  }, 90_000);

  it("discovers, validates, promotes, replays with zero LLM calls, repairs after structural change, and preserves rollback safety", async () => {
    fixture = await startVersionedPublisherFixture();
    const store = new MemoryRuntimeStore();
    const workflowStore = new MemoryWorkflowRepository();
    const artifacts = new MemoryArtifactStore();
    const browser = LocalPlaywrightBrowserExecutor.forTest();
    const gateway = new VersionedPublisherGateway(fixture.origin);
    const controller = new ClosedLoopWebOperatorLifecycle({
      runtimeStore: store,
      workflowStore,
      artifacts,
      browserExecutor: browser,
      structured: browser,
      visual: browser,
      modelGateway: gateway,
      softwareVersion: "test-runtime",
      toolSchemaVersion: "web-operator-tools-v1",
      workerIdFactory: () => "closed-loop-worker"
    });

    const discovered = await controller.acquire(request(fixture.origin, "v1-discovery", "article-v1"), lifecycleAt(0));
    expect(discovered.state).toBe("acquired_by_agent");
    if (discovered.state !== "acquired_by_agent") throw new Error("expected agent discovery");
    expect(discovered.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v1`);
    expect(discovered.workflow).toMatchObject({ state: "ACTIVE", version: 1 });
    expect(discovered.modelCalls).toBeGreaterThan(0);
    expect(await store.getOutbox(discovered.run.runId)).toMatchObject({
      state: "acknowledged",
      attempts: 1
    });
    const modelCallsBeforeReplay = gateway.calls;

    const resumedController = new ClosedLoopWebOperatorLifecycle({
      runtimeStore: store,
      workflowStore,
      artifacts,
      browserExecutor: browser,
      structured: browser,
      visual: browser,
      modelGateway: gateway,
      softwareVersion: "test-runtime",
      toolSchemaVersion: "web-operator-tools-v1",
      workerIdFactory: () => "closed-loop-worker"
    });
    const resumedFinalization = await resumedController.finalizeSuccessfulAgentRun(discovered.run.runId, lifecycleAt(30_000));
    const repeatedFinalization = await resumedController.finalizeSuccessfulAgentRun(discovered.run.runId, lifecycleAt(45_000));
    expect(resumedFinalization.workflow.id).toBe(discovered.workflow.id);
    expect(repeatedFinalization.workflow.id).toBe(discovered.workflow.id);
    expect(await workflowStore.listWorkflowCandidates("resource-closed-loop")).toHaveLength(1);

    const replayed = await controller.acquire(request(fixture.origin, "v1-refresh", "article-v1"), lifecycleAt(60_000));
    expect(replayed.state).toBe("acquired_by_workflow");
    if (replayed.state !== "acquired_by_workflow") throw new Error("expected deterministic replay");
    expect(replayed.modelCalls).toBe(0);
    expect(replayed.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v1`);
    expect(gateway.calls).toBe(modelCallsBeforeReplay);

    fixture.setVersion("v2");
    const activeV1 = (await workflowStore.getActiveWorkflow("resource-closed-loop"))!;
    await workflowStore.saveFailureEvidence({
      id: makeId("workflow_failure", activeV1.id, "transient"),
      workflowId: activeV1.id,
      resourceId: activeV1.resourceId,
      failureClass: "transient_browser_network_failure",
      transient: true,
      details: { reason: "single bounded timeout-like event" },
      observedAt: "2026-09-13T00:02:00Z"
    });

    const firstBreak = await controller.acquire(request(fixture.origin, "v2-repair", "article-v2"), lifecycleAt(180_000));
    expect(firstBreak.state).toBe("waiting_for_repair_evidence");
    if (firstBreak.state !== "waiting_for_repair_evidence") throw new Error("expected repair gate to wait");
    expect(firstBreak.failureEvidence.filter((entry) => !entry.transient && entry.failureClass === "structural_site_change")).toHaveLength(1);
    expect(firstBreak.routeDecision).toMatchObject({
      method: "deterministic_browser_workflow",
      reason: "waiting_for_bounded_structural_evidence"
    });

    const repaired = await controller.acquire(request(fixture.origin, "v2-repair", "article-v2"), lifecycleAt(240_000));
    expect(repaired.state).toBe("acquired_by_agent");
    if (repaired.state !== "acquired_by_agent") throw new Error("expected agent repair");
    expect(repaired.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v2`);
    expect(repaired.workflow).toMatchObject({ state: "ACTIVE", version: 2 });
    expect(await workflowStore.getWorkflowCandidate(activeV1.id)).toMatchObject({ state: "SUPERSEDED", supersededBy: repaired.workflow.id });
    const modelCallsBeforeV2Replay = gateway.calls;

    const replayedV2 = await controller.acquire(request(fixture.origin, "v2-refresh", "article-v2"), lifecycleAt(300_000));
    expect(replayedV2.state).toBe("acquired_by_workflow");
    if (replayedV2.state !== "acquired_by_workflow") throw new Error("expected v2 deterministic replay");
    expect(replayedV2.modelCalls).toBe(0);
    expect(replayedV2.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v2`);
    expect(gateway.calls).toBe(modelCallsBeforeV2Replay);

    await workflowStore.markWorkflow(repaired.workflow.id, "ROLLED_BACK", "2026-09-13T00:06:00Z");
    expect(await workflowStore.getActiveWorkflow("resource-closed-loop")).toBeNull();
  }, 60_000);

  it("resumes repair finalization after router-authorized structural failure without duplicating replacement workflows", async () => {
    fixture = await startVersionedPublisherFixture();
    const store = new MemoryRuntimeStore();
    const backingWorkflowStore = new MemoryWorkflowRepository();
    const artifacts = new MemoryArtifactStore();
    const browser = LocalPlaywrightBrowserExecutor.forTest();
    const gateway = new VersionedPublisherGateway(fixture.origin);
    const discoveryController = closedLoopController({
      store,
      workflowStore: backingWorkflowStore,
      artifacts,
      browser,
      gateway
    });
    const discovered = await discoveryController.acquire(request(fixture.origin, "repair-restart-v1", "article-v1"), lifecycleAt(0));
    expect(discovered.state).toBe("acquired_by_agent");
    if (discovered.state !== "acquired_by_agent") throw new Error("expected initial discovery");

    fixture.setVersion("v2");
    const activeV1 = (await backingWorkflowStore.getActiveWorkflow("resource-closed-loop"))!;
    const repairWorkflowStore = new FailOnceWorkflowRepository(backingWorkflowStore, "candidate");
    const repairController = closedLoopController({
      store,
      workflowStore: repairWorkflowStore,
      artifacts,
      browser,
      gateway
    });
    const firstStructuralEvidence = await repairController.acquire(request(fixture.origin, "repair-restart-v2", "article-v2"), lifecycleAt(60_000));
    expect(firstStructuralEvidence.state).toBe("waiting_for_repair_evidence");

    await expect(repairController.acquire(request(fixture.origin, "repair-restart-v2", "article-v2"), lifecycleAt(120_000)))
      .rejects.toThrow(/candidate/);
    const modelCallsAfterInterruptedRepair = gateway.calls;

    const resumedRepairController = closedLoopController({
      store,
      workflowStore: repairWorkflowStore,
      artifacts,
      browser,
      gateway
    });
    const repaired = await resumedRepairController.acquire(request(fixture.origin, "repair-restart-v2", "article-v2"), lifecycleAt(180_000));
    expect(repaired.state).toBe("acquired_by_agent");
    if (repaired.state !== "acquired_by_agent") throw new Error("expected resumed repair finalization");
    expect(repaired.process.status).toBe("already_completed");
    expect(gateway.calls).toBe(modelCallsAfterInterruptedRepair);
    expect(repaired.workflow).toMatchObject({ state: "ACTIVE", version: 2 });
    expect(await backingWorkflowStore.getWorkflowCandidate(activeV1.id)).toMatchObject({ state: "SUPERSEDED", supersededBy: repaired.workflow.id });
    expect((await backingWorkflowStore.listWorkflowCandidates("resource-closed-loop")).filter((workflow) => workflow.state === "ACTIVE")).toHaveLength(1);
  }, 90_000);
});

class VersionedPublisherGateway implements ModelGateway {
  readonly id = "versioned-publisher-gateway";
  readonly strategies: string[] = [];
  calls = 0;

  constructor(private readonly origin: string) {}

  async complete(request: ModelRequest) {
    this.calls += 1;
    const url = request.dynamic.pageState.url;
    const controls = request.dynamic.pageState.relevantControls;
    const v1Link = controls.find((control) => control.destinationUrl === `${this.origin}/article-v1` && control.interactionCapability);
    const v2Link = controls.find((control) => control.destinationUrl === `${this.origin}/article-v2` && control.interactionCapability);
    let planToReturn: BoundedActionPlan;
    if (request.dynamic.pageState.article?.canonicalUrl) {
      planToReturn = plan(
        action("browser.extract@1", {}),
        action("run.propose_completion@1", { citedObservationIds: ["$latestObservation"] })
      );
    } else if (v1Link) {
      this.strategies.push("section_listing");
      planToReturn = plan(action("browser.follow_link@1", {
        handle: v1Link.handle,
        observationRevision: request.dynamic.pageState.pageRevision,
        capability: v1Link.interactionCapability
      }, { urlIncludes: "/article-v1" }));
    } else if (v2Link) {
      this.strategies.push("search_results");
      planToReturn = plan(action("browser.follow_link@1", {
        handle: v2Link.handle,
        observationRevision: request.dynamic.pageState.pageRevision,
        capability: v2Link.interactionCapability
      }, { urlIncludes: "/article-v2" }));
    } else if (request.dynamic.objective.includes("article-v2") || request.dynamic.objective.includes("Repair")) {
      this.strategies.push(url.includes("/broken-archive") ? "repair_replan_to_search" : "search");
      planToReturn = plan(action("browser.navigate@1", { url: `${this.origin}/search` }, { urlIncludes: "/search" }));
    } else {
      this.strategies.push("homepage_to_archive");
      planToReturn = plan(action("browser.navigate@1", { url: `${this.origin}/archive` }, { urlIncludes: "/archive" }));
    }
    return {
      plan: planToReturn,
      usage: { inputTokens: 25, outputTokens: 15, costUsd: 0, latencyMs: 1 },
      provider: "fixture",
      model: "fixture/fast",
      responseId: makeId("model_response", request.callId, this.strategies.length, url),
      gateway: this.id,
      deployment: "api" as const
    };
  }
}

interface VersionedPublisherFixture {
  origin: string;
  setVersion(version: "v1" | "v2"): void;
  close(): Promise<void>;
}

async function startVersionedPublisherFixture(): Promise<VersionedPublisherFixture> {
  let version: "v1" | "v2" = "v1";
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (url.pathname === "/archive") {
      response.end(page("Archive", version === "v1"
        ? `<main><h1>Section archive</h1><a href="/article-v1">Newest qualifying article</a></main>`
        : `<main><h1>Archive changed</h1><p>The archive no longer exposes the newest qualifying article.</p></main>`));
      return;
    }
    if (url.pathname === "/search") {
      response.end(page("Search", `<main><h1>Search results</h1><a href="/article-v2">Newest qualifying article</a></main>`));
      return;
    }
    if (url.pathname === "/article-v1") {
      response.end(article(url.origin, "article-v1", "Publisher v1 article", "2026-09-10T12:00:00Z"));
      return;
    }
    if (url.pathname === "/article-v2") {
      response.end(article(url.origin, "article-v2", "Publisher v2 article", "2026-09-13T12:00:00Z"));
      return;
    }
    response.end(page("Home", `<main><h1>Publisher home</h1></main>`));
  });
  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("versioned publisher fixture did not bind TCP");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    setVersion: (next) => { version = next; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function article(origin: string, slug: string, title: string, timestamp: string) {
  return page(title, `
    <div data-watermark-observed="true">watermark reached</div>
    <article>
      <h1>${title}</h1>
      <time datetime="${timestamp}">${timestamp}</time>
      <p data-excerpt>${title} excerpt</p>
      <div data-article-body>${title} body used for deterministic closed-loop acquisition.</div>
    </article>
    <link rel="canonical" href="${origin}/${slug}">
  `);
}

function page(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

function closedLoopController(input: {
  store: MemoryRuntimeStore;
  workflowStore: WorkflowRepository;
  acquisitionFailures?: MemoryAcquisitionFailureRepository;
  artifacts: MemoryArtifactStore;
  browser: LocalPlaywrightBrowserExecutor;
  gateway: ModelGateway;
  deterministicAcquisition?: Partial<Record<"structured_api_feed" | "http_deterministic_extraction", DeterministicAcquisitionPort>>;
}) {
  return new ClosedLoopWebOperatorLifecycle({
    runtimeStore: input.store,
    workflowStore: input.workflowStore,
    acquisitionFailures: input.acquisitionFailures,
    artifacts: input.artifacts,
    browserExecutor: input.browser,
    structured: input.browser,
    visual: input.browser,
    modelGateway: input.gateway,
    softwareVersion: "test-runtime",
    toolSchemaVersion: "web-operator-tools-v1",
    deterministicAcquisition: input.deterministicAcquisition,
    workerIdFactory: () => "closed-loop-worker"
  });
}

class FailOnceWorkflowRepository implements WorkflowRepository {
  private failed = false;

  constructor(
    private readonly delegate: WorkflowRepository,
    private readonly boundary: "capture" | "candidate" | "validation" | "promotion"
  ) {}

  async saveCaptureBundle(bundle: WorkflowCaptureBundle): Promise<void> {
    await this.delegate.saveCaptureBundle(bundle);
    this.failAt("capture");
  }

  getCaptureBundle(id: string): Promise<WorkflowCaptureBundle | null> {
    return this.delegate.getCaptureBundle(id);
  }

  async saveWorkflowCandidate(candidate: WorkflowCandidate): Promise<void> {
    await this.delegate.saveWorkflowCandidate(candidate);
    this.failAt("candidate");
  }

  getWorkflowCandidate(id: string): Promise<WorkflowCandidate | null> {
    return this.delegate.getWorkflowCandidate(id);
  }

  listWorkflowCandidates(resourceId: string): Promise<WorkflowCandidate[]> {
    return this.delegate.listWorkflowCandidates(resourceId);
  }

  getActiveWorkflow(resourceId: string): Promise<WorkflowCandidate | null> {
    return this.delegate.getActiveWorkflow(resourceId);
  }

  async saveValidationResult(result: WorkflowValidationResult): Promise<void> {
    await this.delegate.saveValidationResult(result);
    this.failAt("validation");
  }

  getValidationResult(workflowId: string): Promise<WorkflowValidationResult | null> {
    return this.delegate.getValidationResult(workflowId);
  }

  saveFailureEvidence(evidence: WorkflowFailureEvidence): Promise<void> {
    return this.delegate.saveFailureEvidence(evidence);
  }

  listFailureEvidence(workflowId: string): Promise<WorkflowFailureEvidence[]> {
    return this.delegate.listFailureEvidence(workflowId);
  }

  async promoteWorkflow(workflowId: string, validatorId: string, now?: string): Promise<WorkflowCandidate> {
    const promoted = await this.delegate.promoteWorkflow(workflowId, validatorId, now);
    this.failAt("promotion");
    return promoted;
  }

  markWorkflow(
    workflowId: string,
    state: Extract<WorkflowLifecycleState, "REJECTED" | "INVALID" | "ROLLED_BACK">,
    now?: string
  ): Promise<WorkflowCandidate> {
    return this.delegate.markWorkflow(workflowId, state, now);
  }

  private failAt(boundary: "capture" | "candidate" | "validation" | "promotion") {
    if (this.boundary === boundary && !this.failed) {
      this.failed = true;
      throw new Error(`simulated ${boundary} restart boundary`);
    }
  }
}

function request(origin: string, key: string, articleSlug: "article-v1" | "article-v2"): ClosedLoopAcquisitionRequest {
  return {
    tenantId: "tenant",
    resourceId: "resource-closed-loop",
    idempotencyKey: key,
    objective: `Find and acquire ${articleSlug} for the versioned publisher after watermark T.`,
    enabled: true,
    candidate: {
      candidateId: `candidate-${articleSlug}`,
      canonicalUrl: `${origin}/${articleSlug}`,
      publisherId: "versioned-fixture",
      acquisitionAttempt: key
    },
    policy: {
      id: "closed-loop-policy",
      allowedOrigins: [origin],
      allowLoopback: true,
      allowedTools: [
        "browser.navigate@1",
        "browser.inspect_dom@1",
        "browser.inspect_accessibility_tree@1",
        "browser.follow_link@1",
        "browser.extract@1",
        "browser.query_page_state@1",
        "browser.scroll@1",
        "computer.screenshot@1",
        "run.propose_completion@1"
      ],
      visualReadPurposes: ["read-navigation"],
      modelPolicy: {
        allowedProviders: ["fixture"],
        allowedDeployments: ["api"],
        requiredPrivacyEligibility: ["public"],
        allowedRetentionClasses: ["zero_data_retention"]
      }
    },
    modelRouting: {
      mode: "api",
      apiGateway: "openrouter",
      selfHostedGateway: "openai_compatible",
      roles: {
        NAVIGATION_FAST: { primary: { deployment: "api", model: "fixture/fast" }, fallbacks: [] },
        VISION_FAST: { primary: { deployment: "api", model: "fixture/fast" }, fallbacks: [] }
      }
    },
    modelCapabilities,
    budgetLimits: { ...DEFAULT_SLICE_BUDGET, modelCalls: 8, visionCalls: 8, browserActions: 20, navigations: 12, pages: 12 }
  };
}

function acquiredContent(request: ClosedLoopAcquisitionRequest, acceptedAt: string) {
  const body = "Deterministic acquisition route content.";
  return {
    acceptanceId: makeId("accepted_content", request.candidate.candidateId, acceptedAt),
    runId: makeId("deterministic_acquisition", request.idempotencyKey),
    tenantId: request.tenantId,
    resourceId: request.resourceId,
    candidateId: request.candidate.candidateId,
    acquisitionAttempt: request.candidate.acquisitionAttempt,
    generation: 1,
    turnId: "turn_deterministic_route",
    modelCallId: "model_call_not_used",
    toolCallId: "tool_call_deterministic_route",
    observationId: "observation_deterministic_route",
    rawArtifactRef: "artifact://deterministic-route",
    canonicalUrl: request.candidate.canonicalUrl,
    finalUrl: request.candidate.canonicalUrl,
    publisherTimestamp: "2026-09-13T12:00:00Z",
    title: "Deterministic route article",
    excerpt: "Deterministic route article excerpt.",
    body,
    contentHash: makeId("content_hash", request.candidate.canonicalUrl, body),
    acceptedAt
  };
}

const modelCapabilities: ModelCapability[] = [{
  modelRef: "fixture/fast",
  provider: "fixture",
  toolCalling: true,
  vision: true,
  structuredOutput: true,
  reasoningClass: "fast",
  enabled: true,
  inputCostPerMillion: 0,
  outputCostPerMillion: 0,
  deployment: "api",
  externallyHosted: true,
  privacyEligibility: ["public"],
  retentionClass: "zero_data_retention"
}];

function plan(...actions: BoundedActionPlan["actions"]): BoundedActionPlan {
  return { version: 1, actions };
}

function action(tool: BoundedActionPlan["actions"][number]["tool"], arguments_: unknown, expected?: BoundedActionPlan["actions"][number]["expected"]) {
  return { tool, arguments: arguments_, expected };
}
