import { describe, expect, it } from "vitest";
import {
  AcquisitionRouter,
  DEFAULT_SLICE_BUDGET,
  CloudflareBrowserExecutor,
  LocalPlaywrightBrowserExecutor,
  SelfHostedChromiumProvider,
  MemoryArtifactStore,
  MemoryRuntimeStore,
  MemoryWorkflowRepository,
  DeterministicWorkflowExecutor,
  PolicyEngine,
  WebOperatorAcquisitionStrategy,
  WebOperatorCoordinator,
  WorkflowCandidateCompiler,
  WorkflowCaptureService,
  WorkflowLifecycleCoordinator,
  WorkflowValidator,
  admitPublicCandidateAcquisition,
  assertAuthProfileUsable,
  createClosedLoopWebOperatorLifecycle,
  emptyAcquisitionMetrics,
  makeId,
  projectAuthProfileForModel,
  selectBrowserBackend,
  type AuthProfile,
  type BoundedActionPlan,
  type KnownCandidateInvocation,
  type ModelCapability,
  type ModelGateway,
  type ModelRequest,
  type BrowserAllocation,
  type BrowserObservationData,
  type WorkflowCandidate,
  type WorkflowCaptureBundle
} from "../src";
import { startHostileFixture } from "./hostile-fixture";

const capabilities: ModelCapability[] = [{
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

describe("browser backend selection", () => {
  it("selects browser backend from configuration without exposing backend branches to callers", () => {
    const local = selectBrowserBackend({ environment: { DISTILLED_BROWSER_BACKEND: "local" } });
    expect(local.backend).toBe("local");
    expect(local.executor).toBeInstanceOf(LocalPlaywrightBrowserExecutor);
    expect(local.challengeProvider.capabilities().CAPTCHA).toBe("DETECT_ONLY");
    const selfHosted = selectBrowserBackend({ environment: { DISTILLED_BROWSER_PROVIDER: "self_hosted" } });
    expect(selfHosted.providerIdentity).toBe("SELF_HOSTED_CHROMIUM");
    expect(selfHosted.executor).toBeInstanceOf(SelfHostedChromiumProvider);
    expect(selfHosted.challengeProvider).toMatchObject({providerKind:"self_hosted_chromium",productionSafe:true});
    const cloudflare = selectBrowserBackend({
      environment: { DISTILLED_BROWSER_BACKEND: "cloudflare" },
      cloudflare: {
        binding: {},
        launch: async () => ({}) as never
      }
    });
    expect(cloudflare.backend).toBe("cloudflare");
    expect(cloudflare.executor).toBeInstanceOf(CloudflareBrowserExecutor);
    expect(cloudflare.providerIdentity).toBe("CLOUDFLARE_BROWSER");
    expect(cloudflare.challengeProvider).toMatchObject({providerKind:"cloudflare_browser",productionSafe:true});
    expect(cloudflare.challengeProvider.capabilities().CAPTCHA).toBe("DETECT_ONLY");
    expect(() => selectBrowserBackend({ environment: { DISTILLED_BROWSER_BACKEND: "cloudflare" } })).toThrow(/Browser binding/);
    expect(() => selectBrowserBackend({ environment: { DISTILLED_BROWSER_PROVIDER: "other" } })).toThrow(/DISTILLED_BROWSER_PROVIDER/);
  });
});

describe("public candidate acquisition assembly", () => {
  it("admits a public candidate through the configured model-routing contract", async () => {
    const store = new MemoryRuntimeStore();
    const request = invocation("https://fixture.test", "public-admission");
    const admitted = await admitPublicCandidateAcquisition({
      store,
      request: {
        tenantId: request.tenantId,
        resourceId: request.resourceId,
        idempotencyKey: request.idempotencyKey,
        objective: request.objective,
        candidate: request.candidate,
        policy: request.policy,
        modelCapabilities: request.modelCapabilities,
        baseModelRouting: request.modelRouting
      },
      enabled: true,
      environment: {
        DISTILLED_LLM_MODE: "api",
        DISTILLED_LLM_API_GATEWAY: "openrouter"
      }
    });
    expect(admitted.wake).toEqual({ type: "web_operator_run", runId: admitted.run.runId });
    expect((await store.getRunConfiguration(admitted.run.runId))?.modelRouting).toMatchObject({
      mode: "api",
      apiGateway: "openrouter"
    });
  });

  it("assembles the closed-loop lifecycle from configured browser and model gateways", () => {
    const lifecycle = createClosedLoopWebOperatorLifecycle({
      store: new MemoryRuntimeStore(),
      artifacts: new MemoryArtifactStore(),
      workflowStore: new MemoryWorkflowRepository(),
      environment: {
        DISTILLED_BROWSER_BACKEND: "local",
        DISTILLED_LLM_MODE: "api",
        DISTILLED_LLM_API_GATEWAY: "openrouter",
        OPENROUTER_API_KEY: "test-key"
      },
      softwareVersion: "test-runtime",
      toolSchemaVersion: "web-operator-tools-v1",
      gatewayFetcher: async () => new Response("{}", { status: 200 })
    });
    expect(lifecycle).toBeInstanceOf(Object);
  });
});

describe("workflow capture, compilation, validation, promotion, and replay", () => {
  it("captures successful visible behavior, compiles deterministic operations, and requires validator-owned activation", async () => {
    const fixture = await startHostileFixture();
    try {
      const store = new MemoryRuntimeStore();
      const artifacts = new MemoryArtifactStore();
      const workflowStore = new MemoryWorkflowRepository();
      const browser = LocalPlaywrightBrowserExecutor.forTest();
      const admitted = await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate(invocation(fixture.origin, "capture"));
      const coordinator = new WebOperatorCoordinator({
        store,
        artifacts,
        browserExecutor: browser,
        structured: browser,
        visual: browser,
        modelGateway: new KnownCandidateGateway(fixture.origin),
        strategy: new WebOperatorAcquisitionStrategy(store)
      });
      const result = await coordinator.process(admitted.run.runId, "worker");
      expect(result.status).toBe("completed");

      const lifecycle = new WorkflowLifecycleCoordinator({
        workflowStore,
        captureService: new WorkflowCaptureService({
          runtimeStore: store,
          workflowStore,
          softwareVersion: "test-runtime",
          toolSchemaVersion: "web-operator-tools-v1"
        }),
        compiler: new WorkflowCandidateCompiler(),
        validator: new WorkflowValidator()
      });
      const run = (await store.getRun(admitted.run.runId))!;
      const produced = await lifecycle.produceCandidateFromRun(run);
      const capture = produced.capture;
      expect(capture.actions.map((visible) => visible.tool)).toContain("browser.extract@1");
      expect(capture.extractionEvidence[0].canonicalUrl).toBe(`${fixture.origin}/article`);
      expect(capture.discoveryEvidence.canonicalResourceIdentity).toMatchObject({
        resourceId: "resource-capture",
        candidateCanonicalUrl: `${fixture.origin}/article`
      });
      expect(capture.discoveryEvidence.articleUrlPatterns.length).toBeGreaterThan(0);
      expect(capture.discoveryEvidence.pageTypeObservations.map((entry) => entry.pageType)).toContain("article");
      const repeated = await lifecycle.produceCandidateFromRun(run);
      expect(repeated.candidate.id).toBe(produced.candidate.id);
      expect(await workflowStore.listWorkflowCandidates("resource-capture")).toHaveLength(1);
      const candidate = produced.candidate;
      const validation = await lifecycle.validateCandidate(candidate.id, "validator");
      expect(validation.passed).toBe(true);
      expect(validation.criteria).toMatchObject({
        hasAcceptedContentReference: true,
        hasPublicationTimestampEvidence: true,
        hasWatermarkEvidence: true,
        extractionHasContentHash: true
      });
      await expect(workflowStore.getValidationResult(candidate.id)).resolves.toMatchObject({ passed: true });
      expect(await workflowStore.getWorkflowCandidate(candidate.id)).toMatchObject({ state: "VALIDATED" });
      expect(await workflowStore.getActiveWorkflow("resource-capture")).toBeNull();
      await expect(lifecycle.promoteValidatedWorkflow(candidate.id, "validator")).resolves.toMatchObject({ state: "ACTIVE" });
    } finally {
      await fixture.close();
    }
  });

  it("rejects workflow candidates that cannot prove required article evidence", async () => {
    const store = new MemoryWorkflowRepository();
    const capture = workflowCaptureBundle("resource-validation", "missing-required-evidence");
    const candidate = new WorkflowCandidateCompiler().compile(capture, "2026-09-13T00:00:00Z");
    await store.saveCaptureBundle(capture);
    await store.saveWorkflowCandidate(candidate);
    const lifecycle = new WorkflowLifecycleCoordinator({
      workflowStore: store,
      validator: new WorkflowValidator()
    });

    const validation = await lifecycle.validateCandidate(candidate.id, "validator", "2026-09-13T00:00:01Z");
    expect(validation.passed).toBe(false);
    expect(validation.criteria).toMatchObject({
      hasAcceptedContentReference: false,
      hasPublicationTimestampEvidence: false,
      hasWatermarkEvidence: false
    });
    expect(await store.getWorkflowCandidate(candidate.id)).toMatchObject({ state: "INVALID" });
    await expect(lifecycle.promoteValidatedWorkflow(candidate.id, "validator")).rejects.toThrow(/VALIDATED/);
  });

  it("requires confirmed active-workflow structural failure before repair is authorized", async () => {
    const store = new MemoryWorkflowRepository();
    const workflow = workflowCandidate("resource", "repair");
    await store.saveWorkflowCandidate({ ...workflow, state: "VALIDATED" });
    await store.promoteWorkflow(workflow.id, "validator");
    const lifecycle = new WorkflowLifecycleCoordinator({
      workflowStore: store,
      minimumStructuralEvidence: 2
    });
    await expect(lifecycle.decideRepair({
      workflowId: workflow.id,
      attempts: [{ failureClass: "structural_site_change", transient: false }]
    })).resolves.toMatchObject({ repairRequired: false, reason: "insufficient_failure_evidence" });
    await expect(lifecycle.decideRepair({
      workflowId: workflow.id,
      attempts: [
        { failureClass: "structural_site_change", transient: false },
        { failureClass: "structural_site_change", transient: false }
      ]
    })).resolves.toMatchObject({ repairRequired: true, failureClass: "structural_site_change" });
    await store.markWorkflow(workflow.id, "ROLLED_BACK");
    await expect(lifecycle.decideRepair({
      workflowId: workflow.id,
      attempts: [
        { failureClass: "structural_site_change", transient: false },
        { failureClass: "structural_site_change", transient: false }
      ]
    })).resolves.toMatchObject({ repairRequired: false, reason: "only_active_workflows_trigger_repair" });
  });

  it("keeps workflow lifecycle versioned and rollback-safe", async () => {
    const store = new MemoryWorkflowRepository();
    const base = workflowCandidate("resource", "first");
    const replacement = { ...workflowCandidate("resource", "second"), version: 2 };
    await store.saveWorkflowCandidate({ ...base, state: "VALIDATED" });
    await store.promoteWorkflow(base.id, "validator");
    await store.saveWorkflowCandidate({ ...replacement, state: "VALIDATED" });
    await store.promoteWorkflow(replacement.id, "validator");
    expect(await store.getWorkflowCandidate(base.id)).toMatchObject({ state: "SUPERSEDED", supersededBy: replacement.id });
    await store.markWorkflow(replacement.id, "ROLLED_BACK");
    expect(await store.getWorkflowCandidate(replacement.id)).toMatchObject({ state: "ROLLED_BACK" });
  });

  it("replays a validated workflow deterministically with zero model calls and candidate-bound extraction", async () => {
    const workflow: WorkflowCandidate = { ...workflowCandidate("resource", "replay"), state: "VALIDATED" as const };
    workflow.operations = [
      {
        id: makeId("workflow_operation", "navigate"),
        kind: "navigate",
        locatorAlternatives: [{ kind: "url_pattern", value: "https://fixture.test/article", confidence: 1 }]
      },
      {
        id: makeId("workflow_operation", "extract"),
        kind: "extract_article",
        locatorAlternatives: [{ kind: "article_canonical", value: "https://fixture.test/article", confidence: 1 }],
        expected: { candidateCanonicalUrl: "https://fixture.test/article" }
      }
    ];
    const browser = new DeterministicBrowserDouble("https://fixture.test/article");
    const replay = await new DeterministicWorkflowExecutor({
      artifacts: new MemoryArtifactStore(),
      browserExecutor: browser,
      structured: browser,
      policy: workflowPolicy(["browser.navigate@1", "browser.extract@1"])
    }).execute({
      workflow,
      run: runRecord("resource"),
      allocation: allocation(),
      budget: DEFAULT_SLICE_BUDGET
    });
    expect(replay).toMatchObject({ state: "completed", modelCalls: 0 });
    expect(replay.acquiredContent?.canonicalUrl).toBe("https://fixture.test/article");
    expect(browser.navigateCalls).toBe(1);
    expect(browser.extractCalls).toBe(1);

    const mismatchBrowser = new DeterministicBrowserDouble("https://fixture.test/wrong");
    const mismatch = await new DeterministicWorkflowExecutor({
      artifacts: new MemoryArtifactStore(),
      browserExecutor: mismatchBrowser,
      structured: mismatchBrowser,
      policy: workflowPolicy(["browser.navigate@1", "browser.extract@1"])
    }).execute({
      workflow,
      run: runRecord("resource"),
      allocation: allocation(),
      budget: DEFAULT_SLICE_BUDGET
    });
    expect(mismatch).toMatchObject({ state: "failed", failureClass: "extraction_mismatch", modelCalls: 0 });
  });

  it("stops deterministic workflow replay before browser effects when policy or budget denies authority", async () => {
    const workflow: WorkflowCandidate = { ...workflowCandidate("resource", "replay-denied"), state: "VALIDATED" as const };
    workflow.operations = [{
      id: makeId("workflow_operation", "denied-navigate"),
      kind: "navigate",
      locatorAlternatives: [{ kind: "url_pattern", value: "https://fixture.test/article", confidence: 1 }]
    }];

    const policyDeniedBrowser = new DeterministicBrowserDouble("https://fixture.test/article");
    const policyDenied = await new DeterministicWorkflowExecutor({
      artifacts: new MemoryArtifactStore(),
      browserExecutor: policyDeniedBrowser,
      structured: policyDeniedBrowser,
      policy: workflowPolicy(["browser.extract@1"])
    }).execute({
      workflow,
      run: runRecord("resource"),
      allocation: allocation(),
      budget: DEFAULT_SLICE_BUDGET
    });
    expect(policyDenied).toMatchObject({ state: "failed", failureClass: "policy_restriction", modelCalls: 0 });
    expect(policyDeniedBrowser.navigateCalls).toBe(0);

    const budgetDeniedBrowser = new DeterministicBrowserDouble("https://fixture.test/article");
    const budgetDenied = await new DeterministicWorkflowExecutor({
      artifacts: new MemoryArtifactStore(),
      browserExecutor: budgetDeniedBrowser,
      structured: budgetDeniedBrowser,
      policy: workflowPolicy(["browser.navigate@1"])
    }).execute({
      workflow,
      run: runRecord("resource"),
      allocation: allocation(),
      budget: { ...DEFAULT_SLICE_BUDGET, browserActions: 0 }
    });
    expect(budgetDenied).toMatchObject({ state: "failed", failureClass: "policy_restriction", modelCalls: 0 });
    expect(budgetDeniedBrowser.navigateCalls).toBe(0);
  });
});

describe("acquisition router and authorized profiles", () => {
  it("escalates only after bounded typed structural evidence and backs off transients", () => {
    const router = new AcquisitionRouter();
    const candidate = candidateIdentity("https://fixture.test/article");
    expect(router.decide({ candidate, failures: [], budget: DEFAULT_SLICE_BUDGET, policyAllowsWebOperator: true }).method).toBe("structured_api_feed");
    expect(router.decide({
      candidate,
      budget: DEFAULT_SLICE_BUDGET,
      policyAllowsWebOperator: true,
      failures: [{ method: "deterministic_browser_workflow", failureClass: "transient_browser_network_failure", occurredAt: "now" }]
    })).toMatchObject({ method: "deterministic_browser_workflow", reason: "transient_failure_backoff" });
    expect(router.decide({
      candidate,
      budget: DEFAULT_SLICE_BUDGET,
      policyAllowsWebOperator: true,
      failures: [
        { method: "deterministic_browser_workflow", failureClass: "structural_site_change", occurredAt: "one" },
        { method: "deterministic_browser_workflow", failureClass: "extraction_mismatch", occurredAt: "two" }
      ]
    })).toMatchObject({ method: "web_operator", escalatedFrom: "deterministic_browser_workflow" });
  });

  it("projects auth profiles as non-secret capabilities and enforces tenant/domain/expiry", () => {
    const profile: AuthProfile = {
      id: "auth_profile_1",
      tenantId: "tenant",
      ownerId: "owner",
      encryptedBrowserStateRef: "r2://private-state",
      allowedDomains: ["example.com"],
      allowedOperationClass: "authenticated_read",
      version: 3,
      expiresAt: "2026-12-01T00:00:00Z"
    };
    expect(projectAuthProfileForModel(profile)).not.toHaveProperty("encryptedBrowserStateRef");
    expect(() => assertAuthProfileUsable(profile, {
      tenantId: "tenant",
      domain: "example.com",
      operationClass: "authenticated_read",
      now: "2026-09-13T00:00:00Z"
    })).not.toThrow();
    expect(() => assertAuthProfileUsable(profile, {
      tenantId: "tenant",
      domain: "evil.example",
      operationClass: "authenticated_read",
      now: "2026-09-13T00:00:00Z"
    })).toThrow(/domain/);
  });

  it("records research metrics without hidden reasoning or secrets", () => {
    const metrics = emptyAcquisitionMetrics({
      runId: "run",
      resourceId: "resource",
      candidateId: "candidate",
      runtime: {
        softwareVersion: "test-runtime",
        configurationVersion: "config-v1",
        toolSchemaVersion: "web-operator-tools-v1",
        workflowVersion: "workflow-v1"
      }
    });
    expect(JSON.stringify(metrics)).not.toMatch(/cookie|password|chain-of-thought|reasoning/i);
  });
});

describe("agenticity across unfamiliar fixture structures", () => {
  it("lets model-selected strategy vary by observation and replan after changed state", async () => {
    const fixture = await startHostileFixture();
    try {
      const store = new MemoryRuntimeStore();
      const artifacts = new MemoryArtifactStore();
      const browser = LocalPlaywrightBrowserExecutor.forTest();
      const gateway = new AdaptiveDiscoveryGateway(fixture.origin);
      const admitted = await new WebOperatorAcquisitionStrategy(store).admitKnownCandidate({
        ...invocation(fixture.origin, "agenticity"),
        objective: "Find the newest qualifying articles for this publisher after watermark T."
      });
      const result = await new WebOperatorCoordinator({
        store,
        artifacts,
        browserExecutor: browser,
        structured: browser,
        visual: browser,
        modelGateway: gateway,
        strategy: new WebOperatorAcquisitionStrategy(store)
      }).process(admitted.run.runId, "worker");
      expect(result.status).toBe("completed");
      expect(gateway.strategiesTried).toEqual(["homepage", "section", "search_replan"]);
      const modelOutputs = (await store.listEvents(admitted.run.runId)).filter((event) => event.type === "agent.model.output_visible");
      expect(modelOutputs.length).toBeGreaterThan(1);
    } finally {
      await fixture.close();
    }
  });
});

class AdaptiveDiscoveryGateway implements ModelGateway {
  readonly id = "adaptive-discovery";
  readonly strategiesTried: string[] = [];
  private turn = 0;

  constructor(private readonly origin: string) {}

  async complete(_request: ModelRequest) {
    this.turn += 1;
    let planToReturn: BoundedActionPlan;
    if (this.turn === 1) {
      this.strategiesTried.push("homepage");
      planToReturn = plan(action("browser.navigate@1", { url: `${this.origin}/unknown-home` }, { urlIncludes: "/unknown-home" }));
    } else if (this.turn === 2) {
      this.strategiesTried.push("section");
      planToReturn = plan(action("browser.navigate@1", { url: `${this.origin}/section` }, { urlIncludes: "/section" }));
    } else if (this.turn === 3) {
      this.strategiesTried.push("search_replan");
      planToReturn = plan(action("browser.navigate@1", { url: `${this.origin}/article` }, { urlIncludes: "/article" }));
    } else {
      planToReturn = plan(
        action("browser.extract@1", {}),
        action("run.propose_completion@1", { citedObservationIds: ["$latestObservation"] })
      );
    }
    return {
      plan: planToReturn,
      usage: { inputTokens: 20, outputTokens: 10, costUsd: 0, latencyMs: 1 },
      provider: "fixture",
      model: "fixture/fast",
      responseId: `adaptive-${this.turn}`,
      gateway: this.id,
      deployment: "api" as const
    };
  }
}

class KnownCandidateGateway implements ModelGateway {
  readonly id = "known-candidate";
  private turn = 0;

  constructor(private readonly origin: string) {}

  async complete(request: ModelRequest) {
    this.turn += 1;
    const controls = request.dynamic.pageState.relevantControls;
    const follow = controls.find((control) => control.destinationUrl === `${this.origin}/article` && control.interactionCapability);
    const planToReturn = this.turn === 1
      ? plan(action("browser.navigate@1", { url: `${this.origin}/semantic` }, { urlIncludes: "/semantic" }))
      : this.turn === 2 && follow
        ? plan(action("browser.follow_link@1", {
            handle: follow.handle,
            observationRevision: request.dynamic.pageState.pageRevision,
            capability: follow.interactionCapability
          }, { urlIncludes: "/article" }))
        : plan(
            action("browser.extract@1", {}),
            action("run.propose_completion@1", { citedObservationIds: ["$latestObservation"] })
          );
    return {
      plan: planToReturn,
      usage: { inputTokens: 20, outputTokens: 10, costUsd: 0, latencyMs: 1 },
      provider: "fixture",
      model: "fixture/fast",
      responseId: `known-${this.turn}`,
      gateway: this.id,
      deployment: "api" as const
    };
  }
}

function plan(...actions: BoundedActionPlan["actions"]): BoundedActionPlan {
  return { version: 1, actions };
}

function action(tool: BoundedActionPlan["actions"][number]["tool"], arguments_: unknown, expected?: BoundedActionPlan["actions"][number]["expected"]) {
  return { tool, arguments: arguments_, expected };
}

function invocation(origin: string, suffix: string): KnownCandidateInvocation {
  return {
    tenantId: "tenant",
    resourceId: `resource-${suffix}`,
    idempotencyKey: `key-${suffix}`,
    objective: "Acquire known candidate",
    enabled: true,
    candidate: candidateIdentity(`${origin}/article`),
    policy: {
      id: "policy",
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
        "computer.move_pointer@1",
        "computer.click@1",
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
        NAVIGATION_FAST: {
          primary: { deployment: "api", model: "fixture/fast" },
          fallbacks: []
        },
        VISION_FAST: {
          primary: { deployment: "api", model: "fixture/fast" },
          fallbacks: []
        }
      }
    },
    modelCapabilities: capabilities,
    budgetLimits: { ...DEFAULT_SLICE_BUDGET, visionCalls: 8, modelCalls: 8, navigations: 8, pages: 8 }
  };
}

function candidateIdentity(canonicalUrl: string) {
  return {
    candidateId: makeId("candidate", canonicalUrl),
    canonicalUrl,
    publisherId: "fixture",
    acquisitionAttempt: "attempt"
  };
}

function workflowCandidate(resourceId: string, suffix: string) {
  return {
    id: makeId("workflow_candidate", resourceId, suffix),
    tenantId: "tenant",
    resourceId,
    sourceCaptureId: makeId("workflow_capture", suffix),
    candidate: candidateIdentity("https://fixture.test/article"),
    state: "CANDIDATE" as const,
    version: 1,
    operations: [{
      id: makeId("workflow_operation", suffix),
      kind: "navigate" as const,
      locatorAlternatives: [{ kind: "url_pattern" as const, value: "https://fixture.test/article", confidence: 1 }]
    }],
    unsupportedGaps: [],
    createdAt: "2026-09-13T00:00:00Z"
  };
}

function workflowCaptureBundle(resourceId: string, suffix: string): WorkflowCaptureBundle {
  const canonicalUrl = "https://fixture.test/article";
  return {
    id: makeId("workflow_capture", resourceId, suffix),
    runId: makeId("run", resourceId, suffix),
    tenantId: "tenant",
    resourceId,
    candidate: candidateIdentity(canonicalUrl),
    actions: [{
      tool: "browser.extract@1",
      arguments: {},
      observationAfterId: makeId("observation", suffix),
      effectCertainty: "known_applied",
      browserGeneration: 1,
      occurredAt: "2026-09-13T00:00:00Z"
    }],
    observationIds: [makeId("observation", suffix)],
    successfulAlternatives: ["browser.extract@1"],
    failedAlternatives: [],
    discoveryEvidence: {
      canonicalResourceIdentity: {
        resourceId,
        candidateCanonicalUrl: canonicalUrl,
        publisherId: "fixture"
      },
      listingUrlCandidates: [],
      paginationBehavior: {
        watermarkObserved: false,
        exhausted: false,
        evidenceObservationIds: []
      },
      articleUrlPatterns: [canonicalUrl],
      publicationTimeEvidence: [],
      pageTypeObservations: [{
        observationId: makeId("observation", suffix),
        url: canonicalUrl,
        pageType: "article",
        title: "Article"
      }],
      locatorEvidence: [],
      requiredReadCapabilities: [],
      stoppingWatermarkEvidence: []
    },
    extractionEvidence: [{
      observationId: makeId("observation", suffix),
      canonicalUrl,
      contentHash: "hash"
    }],
    completionEvidence: {
      citedObservationIds: [makeId("observation", suffix)],
      watermarkObserved: false
    },
    runtime: {
      softwareVersion: "test-runtime",
      toolSchemaVersion: "web-operator-tools-v1",
      workflowSchemaVersion: "workflow-capture-v1"
    },
    createdAt: "2026-09-13T00:00:00Z"
  };
}

function runRecord(resourceId: string) {
  return {
    runId: "run",
    tenantId: "tenant",
    resourceId,
    idempotencyKey: "key",
    objective: "Acquire",
    mode: "known_candidate" as const,
    state: "running" as const,
    generation: 1,
    policySnapshotId: "policy",
    completionContractVersion: "known-candidate-watermark-v1",
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
    candidate: candidateIdentity("https://fixture.test/article")
  };
}

function allocation(): BrowserAllocation {
  return {
    runId: "run",
    tenantId: "tenant",
    sessionId: "session",
    contextId: "context",
    generation: 1,
    pageId: "page",
    viewport: { width: 960, height: 720, deviceScaleFactor: 1 }
  };
}

function workflowPolicy(allowedTools: Array<"browser.navigate@1" | "browser.extract@1">) {
  return new PolicyEngine({
    id: "policy",
    allowedOrigins: ["https://fixture.test"],
    allowLoopback: false,
    allowedTools,
    visualReadPurposes: [],
    modelPolicy: {
      allowedProviders: ["fixture"],
      allowedDeployments: ["api"],
      requiredPrivacyEligibility: ["public"],
      allowedRetentionClasses: ["zero_data_retention"]
    }
  });
}

class DeterministicBrowserDouble {
  navigateCalls = 0;
  extractCalls = 0;

  constructor(private readonly articleCanonicalUrl: string) {}

  async allocate(): Promise<BrowserAllocation> { return allocation(); }
  async health() { return "healthy" as const; }
  async close() {}
  async crashForTest() {}
  async bindObservationCapabilities(_scope: BrowserAllocation, input: { controls: BrowserObservationData["controls"] }) { return input.controls; }
  async navigate(_scope: BrowserAllocation, url: string) {
    this.navigateCalls += 1;
    return this.output(url, undefined);
  }
  async inspectDom(scope: BrowserAllocation) { return this.navigate(scope, "https://fixture.test/article"); }
  async inspectAccessibilityTree(scope: BrowserAllocation) { return this.inspectDom(scope); }
  async followLink(scope: BrowserAllocation) { return this.navigate(scope, "https://fixture.test/article"); }
  async extract() {
    this.extractCalls += 1;
    return this.output(this.articleCanonicalUrl, this.articleCanonicalUrl);
  }
  async queryPageState(scope: BrowserAllocation) { return this.inspectDom(scope); }
  async scroll(scope: BrowserAllocation) { return this.inspectDom(scope); }

  private output(url: string, articleCanonicalUrl: string | undefined): BrowserObservationData {
    return {
      url,
      finalUrl: url,
      title: "Article",
      pageId: "page",
      pageRevision: makeId("revision", url, articleCanonicalUrl ?? "listing"),
      contentType: "application/vnd.distilled.cdp-snapshot+json",
      raw: new TextEncoder().encode(url),
      representation: { url },
      observationSource: "CDP_DOM_SNAPSHOT",
      protocolSnapshotVersion: "test-snapshot-v1",
      controls: [],
      challengeState: "NO_CHALLENGE",
      watermarkObserved: true,
      article: articleCanonicalUrl ? {
        title: "Article",
        canonicalUrl: articleCanonicalUrl,
        publisherTimestamp: "2026-09-13T00:00:00Z",
        excerpt: "Excerpt",
        body: "Body"
      } : undefined
    };
  }
}
