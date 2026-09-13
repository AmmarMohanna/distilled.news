import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClosedLoopWebOperatorLifecycle,
  DEFAULT_SLICE_BUDGET,
  LocalPlaywrightBrowserExecutor,
  MemoryArtifactStore,
  MemoryRuntimeStore,
  MemoryWorkflowRepository,
  makeId,
  type BoundedActionPlan,
  type ClosedLoopAcquisitionRequest,
  type ModelCapability,
  type ModelGateway,
  type ModelRequest
} from "../src";

describe("closed-loop Web Operator lifecycle", () => {
  let fixture: VersionedPublisherFixture | undefined;
  afterEach(async () => { await fixture?.close(); fixture = undefined; });

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

    const discovered = await controller.acquire(request(fixture.origin, "v1-discovery", "article-v1"), new Date("2026-09-13T00:00:00Z"));
    expect(discovered.state).toBe("acquired_by_agent");
    if (discovered.state !== "acquired_by_agent") throw new Error("expected agent discovery");
    expect(discovered.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v1`);
    expect(discovered.workflow).toMatchObject({ state: "ACTIVE", version: 1 });
    expect(discovered.modelCalls).toBeGreaterThan(0);

    const replayed = await controller.acquire(request(fixture.origin, "v1-refresh", "article-v1"), new Date("2026-09-13T00:01:00Z"));
    expect(replayed.state).toBe("acquired_by_workflow");
    if (replayed.state !== "acquired_by_workflow") throw new Error("expected deterministic replay");
    expect(replayed.modelCalls).toBe(0);
    expect(replayed.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v1`);

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

    const firstBreak = await controller.acquire(request(fixture.origin, "v2-repair", "article-v2"), new Date("2026-09-13T00:03:00Z"));
    expect(firstBreak.state).toBe("waiting_for_repair_evidence");
    if (firstBreak.state !== "waiting_for_repair_evidence") throw new Error("expected repair gate to wait");
    expect(firstBreak.failureEvidence.filter((entry) => !entry.transient && entry.failureClass === "structural_site_change")).toHaveLength(1);

    const repaired = await controller.acquire(request(fixture.origin, "v2-repair", "article-v2"), new Date("2026-09-13T00:04:00Z"));
    expect(repaired.state).toBe("acquired_by_agent");
    if (repaired.state !== "acquired_by_agent") throw new Error("expected agent repair");
    expect(repaired.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v2`);
    expect(repaired.workflow).toMatchObject({ state: "ACTIVE", version: 2 });
    expect(await workflowStore.getWorkflowCandidate(activeV1.id)).toMatchObject({ state: "SUPERSEDED", supersededBy: repaired.workflow.id });

    const replayedV2 = await controller.acquire(request(fixture.origin, "v2-refresh", "article-v2"), new Date("2026-09-13T00:05:00Z"));
    expect(replayedV2.state).toBe("acquired_by_workflow");
    if (replayedV2.state !== "acquired_by_workflow") throw new Error("expected v2 deterministic replay");
    expect(replayedV2.modelCalls).toBe(0);
    expect(replayedV2.acquiredContent.canonicalUrl).toBe(`${fixture.origin}/article-v2`);

    await workflowStore.markWorkflow(repaired.workflow.id, "ROLLED_BACK", "2026-09-13T00:06:00Z");
    expect(await workflowStore.getActiveWorkflow("resource-closed-loop")).toBeNull();
  }, 60_000);
});

class VersionedPublisherGateway implements ModelGateway {
  readonly id = "versioned-publisher-gateway";
  readonly strategies: string[] = [];

  constructor(private readonly origin: string) {}

  async complete(request: ModelRequest) {
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
