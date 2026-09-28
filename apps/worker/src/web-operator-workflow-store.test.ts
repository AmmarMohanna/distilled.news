import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { acquisitionFailureEvidence, makeId, SourceAcquisitionOrchestrator, DeterministicSourceBrowserWorkflowExecutor, verifyBrowserUseProposal, type AcquisitionEvaluationMetrics, type PublicBrowserObservation, type SourceAcquisitionRequest, type SourceBrowserWorkflowPort, type WorkflowCaptureBundle, type WorkflowCandidate } from "@distilled/agent-runtime";
import { D1WorkflowRepository } from "./web-operator-workflow-store";

let mf: Miniflare | undefined;

describe("D1 Web Operator workflow lifecycle store", () => {
  afterEach(async () => { await mf?.dispose(); mf = undefined; });

  it("persists capture, validation, promotion, supersession, rollback, and evaluation metrics", async () => {
    const { store } = await setup();
    const capture = captureBundle("resource", "first");
    await store.saveCaptureBundle(capture);
    expect(await store.getCaptureBundle(capture.id)).toMatchObject({ id: capture.id, runId: capture.runId });

    const first = workflowCandidate(capture, 1);
    await store.saveWorkflowCandidate(first);
    await store.saveValidationResult({
      workflowId: first.id,
      passed: true,
      criteria: { hasOperations: true },
      validatedAt: "2026-09-13T00:00:00Z"
  });

    expect(await store.getValidationResult(first.id)).toMatchObject({ workflowId: first.id, passed: true });
    const active = await store.promoteWorkflow(first.id, "validator");
    expect(active.state).toBe("ACTIVE");

    const replacementCapture = captureBundle("resource", "second");
    await store.saveCaptureBundle(replacementCapture);
    const replacement = workflowCandidate(replacementCapture, 2);
    await store.saveWorkflowCandidate(replacement);
    await store.saveValidationResult({
      workflowId: replacement.id,
      passed: true,
      criteria: { hasOperations: true },
      validatedAt: "2026-09-13T00:01:00Z"
    });
    await store.promoteWorkflow(replacement.id, "validator");
    expect(await store.getWorkflowCandidate(first.id)).toMatchObject({ state: "SUPERSEDED", supersededBy: replacement.id });
    await store.saveFailureEvidence({
      id: makeId("workflow_failure", replacement.id, "first"),
      workflowId: replacement.id,
      resourceId: "resource",
      failureClass: "structural_site_change",
      transient: false,
      operationId: replacement.operations[0].id,
      details: { reason: "expected article structure changed" },
      observedAt: "2026-09-13T00:01:30Z"
    });
    expect(await store.listFailureEvidence(replacement.id)).toHaveLength(1);
    const routeFailure = acquisitionFailureEvidence({
      tenantId: "tenant",
      resourceId: "resource",
      candidateId: "candidate",
      method: "structured_api_feed",
      failureClass: "source_unavailable",
      transient: false,
      details: { reason: "feed missing" },
      occurredAt: "2026-09-13T00:01:45Z"
    });
    await store.saveAcquisitionFailure(routeFailure);
    await store.saveAcquisitionFailure(routeFailure);
    expect(await store.listAcquisitionFailures({
      tenantId: "tenant",
      resourceId: "resource",
      candidateId: "candidate"
    })).toEqual([routeFailure]);
    await store.markWorkflow(replacement.id, "ROLLED_BACK");
    expect(await store.getActiveWorkflow("resource")).toBeNull();
    const finalization = {
      runId: "run",
      state: "NOT_PROMOTED" as const,
      reason: "validation_failed" as const,
      captureId: replacementCapture.id,
      workflowId: replacement.id,
      recordedAt: "2026-09-13T00:01:50Z"
    };
    await store.saveFinalizationOutcome(finalization);
    expect(await store.getFinalizationOutcome("run")).toEqual(finalization);

    const metrics: AcquisitionEvaluationMetrics = {
      runId: "run",
      resourceId: "resource",
      candidateId: "candidate",
      acquisitionSucceeded: true,
      correctCandidate: true,
      modelCalls: 1,
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0,
      latencyMs: 20,
      toolActions: 3,
      replans: 1,
      strongModelEscalations: 0,
      visualUsages: 0,
      workflowCompilationSucceeded: true,
      deterministicReplaySucceeded: true,
      repairSucceeded: false,
      verifierRejections: 0,
      policyDenials: 0,
      effectUnknowns: 0,
      challenges: 0,
      runtime: { softwareVersion: "test", configurationVersion: "config", toolSchemaVersion: "tools" },
      recordedAt: "2026-09-13T00:02:00Z"
    };
    await store.recordMetrics(metrics);
  }, 30_000);

  it("replays a Browser Use-discovered dynamic listing from a fresh D1 repository with zero discovery calls", async () => {
    const { db, store } = await setup();
    const source = "https://fixture.test/section", a = "https://fixture.test/article/a", b = "https://fixture.test/article/b";
    const request: SourceAcquisitionRequest = { source: { canonicalSourceUrl: source }, window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" }, acquisitionAsOf: "2026-09-23T00:00:00Z", limits: { maxItems: 5, maxPages: 3, maxScrolls: 2, maxPhysicalAttempts: 12, maxExecutionMs: 20_000 }, authentication: "PUBLIC" };
    const links = (urls: string[]): PublicBrowserObservation => ({ url: source, title: "SPA listing", pageRevision: urls.join(","), visibleText: "", controls: urls.map(url => ({ handle: url, kind: "link", role: "link", label: "Story", safeAction: "follow", destinationUrl: url })) });
    const article = (url: string, timestamp: string): PublicBrowserObservation => ({ url, title: url, pageRevision: url, visibleText: "", controls: [], article: { canonicalUrl: url, title: url, body: `Verified fixture reporting for ${url}. This independently observed source body provides a complete substantive article with the same trusted content threshold required of real public publishers. The fixture never relies on model-provided body or publication metadata.`, excerpt: "", publisherTimestamp: timestamp } });
    const pages = new Map([[a, article(a, "2026-09-21T00:00:00Z")], [b, article(b, "2026-09-20T00:00:00Z")]]);
    const port = (): SourceBrowserWorkflowPort => ({ open: async () => {}, navigateAndObserve: async url => url === source ? links([a]) : pages.get(url)!, scrollAndObserve: async () => links([a, b]), close: async () => {} });
    const proposal = { protocol: "distilled.browser-use.discovery.v1" as const, runId: "run", visitedUrls: [source, a, b], listingUrls: [source], articleUrls: [a, b], continuation: "scroll" as const, timestampHints: [], steps: 4, challengeObserved: false };
    const capability = { runId: "run", tenantId: "tenant", ownerId: "tenant", resourceId: "resource", browserGeneration: 1, allowedOrigins: ["https://fixture.test"], siteKind: "PUBLIC" as const, readOnly: true as const, expiresAt: "2026-09-23T00:02:00Z" };
    let discoveryCalls = 0;
    const execute = async (workflow: WorkflowCandidate, req: SourceAcquisitionRequest) => ({ stage: "BROWSER_WORKFLOW" as const, status: "SUCCESS" as const, result: await new DeterministicSourceBrowserWorkflowExecutor(port()).execute(req, workflow.sourceAcquisition!) });
    const first = new SourceAcquisitionOrchestrator({ structured: async () => ({ stage: "STRUCTURED", status: "INSUFFICIENT" }), http: async () => ({ stage: "HTTP", status: "INSUFFICIENT" }), lookupActiveWorkflow: async () => undefined, webOperator: async () => {
      discoveryCalls++;
      const trusted = await verifyBrowserUseProposal({ request, capability, proposal, port: port() });
      const capture = captureBundle("resource", "browser-use"); await store.saveCaptureBundle(capture);
      const candidate: WorkflowCandidate = { ...workflowCandidate(capture, 1), sourceAcquisition: trusted.plan };
      await store.saveWorkflowCandidate(candidate);
      return { candidate: { id: candidate.id, version: 1, state: "CANDIDATE" as const, execute: req => execute(candidate, req) }, validate: async () => { await store.saveValidationResult({ workflowId: candidate.id, passed: true, criteria: { trustedLinks: trusted.articles.length === 2, deterministicPlan: true }, validatedAt: "2026-09-23T00:00:00Z" }); return { id: candidate.id, version: 1, state: "VALIDATED" as const, execute: req => execute(candidate, req) }; }, activate: async () => { const active = await store.promoteWorkflow(candidate.id, "trusted-source-validator"); return { id: active.id, version: active.version, execute: (req: SourceAcquisitionRequest) => execute(active, req) }; }, modelCalls: 4 };
    } });
    const learned = await first.acquire(request);
    expect(learned.status).toBe("SUCCESS"); expect(learned.result?.items).toHaveLength(2); expect(discoveryCalls).toBe(1); expect(learned.discoveryModelCalls).toBe(4);
    const freshStore = new D1WorkflowRepository(db);
    const second = new SourceAcquisitionOrchestrator({ structured: async () => ({ stage: "STRUCTURED", status: "INSUFFICIENT" }), http: async () => ({ stage: "HTTP", status: "INSUFFICIENT" }), lookupActiveWorkflow: async () => { const active = await freshStore.getActiveWorkflow("resource"); return active ? { id: active.id, version: active.version, execute: (req: SourceAcquisitionRequest) => execute(active, req) } : undefined; }, browserWorkflow: async (req, active) => active!.execute(req), webOperator: async () => { discoveryCalls++; throw new Error("discovery must not run on replay"); } });
    const replay = await second.acquire(request);
    expect(replay.status).toBe("SUCCESS"); expect(replay.result?.items).toEqual(learned.result?.items);
    expect(replay.webOperatorCalls).toBe(0); expect(replay.discoveryModelCalls).toBeUndefined(); expect(discoveryCalls).toBe(1);
    expect((await freshStore.getActiveWorkflow("resource"))?.state).toBe("ACTIVE");
  }, 30_000);

  it("adds durable workflow-finalization outcomes without changing completed acquisition data", async () => {
    const { db } = await setupThrough("0019_openrouter_model_diagnostic.sql");
    await seedAgentRun(db);
    expect(await tableExists(db, "web_operator_workflow_finalization_outcomes")).toBe(false);
    await applyMigration(db, "0020_workflow_finalization_outcomes.sql");
    const store = new D1WorkflowRepository(db);
    const outcome = {
      runId: "run",
      state: "NOT_PROMOTED" as const,
      reason: "candidate_production_failed" as const,
      recordedAt: "2026-09-13T00:03:00Z"
    };
    await store.saveFinalizationOutcome(outcome);
    await store.saveFinalizationOutcome(outcome);
    expect(await store.getFinalizationOutcome("run")).toEqual(outcome);
    expect(await db.prepare("SELECT state FROM agent_runs WHERE run_id='run'").first()).toMatchObject({ state: "completed" });
  }, 30_000);

  it("upgrades existing workflow data from 0014 and enables acquisition-failure evidence without backfill", async () => {
    const { db } = await setupThrough("0014_web_operator_workflow_failure_evidence.sql");
    await seedAgentRun(db);
    const storeBeforeUpgrade = new D1WorkflowRepository(db);
    const capture = captureBundle("resource", "upgrade");
    await storeBeforeUpgrade.saveCaptureBundle(capture);
    const workflow = workflowCandidate(capture, 1);
    await storeBeforeUpgrade.saveWorkflowCandidate(workflow);
    await storeBeforeUpgrade.saveValidationResult({
      workflowId: workflow.id,
      passed: true,
      criteria: { hasOperations: true, hasAcceptedContentReference: true },
      validatedAt: "2026-09-13T00:00:00Z"
    });
    const activeBeforeUpgrade = await storeBeforeUpgrade.promoteWorkflow(workflow.id, "validator", "2026-09-13T00:00:01Z");
    await storeBeforeUpgrade.saveFailureEvidence({
      id: makeId("workflow_failure", workflow.id, "upgrade"),
      workflowId: workflow.id,
      resourceId: "resource",
      failureClass: "structural_site_change",
      transient: false,
      operationId: workflow.operations[0].id,
      details: { reason: "representative pre-0015 workflow evidence" },
      observedAt: "2026-09-13T00:00:02Z"
    });
    expect(await tableExists(db, "web_operator_acquisition_failure_evidence")).toBe(false);

    await applyMigration(db, "0015_web_operator_acquisition_failure_evidence.sql");
    expect(await tableExists(db, "web_operator_acquisition_failure_evidence")).toBe(true);
    const storeAfterUpgrade = new D1WorkflowRepository(db);
    expect(await storeAfterUpgrade.getWorkflowCandidate(workflow.id)).toMatchObject({
      id: activeBeforeUpgrade.id,
      state: "ACTIVE",
      version: 1
    });
    expect(await storeAfterUpgrade.getValidationResult(workflow.id)).toMatchObject({ workflowId: workflow.id, passed: true });
    expect(await storeAfterUpgrade.listFailureEvidence(workflow.id)).toHaveLength(1);
    expect(await storeAfterUpgrade.getActiveWorkflow("resource")).toMatchObject({ id: workflow.id, state: "ACTIVE" });

    const routeFailure = acquisitionFailureEvidence({
      tenantId: "tenant",
      resourceId: "resource",
      candidateId: "candidate",
      method: "http_deterministic_extraction",
      failureClass: "source_unavailable",
      transient: false,
      details: { reason: "deterministic extractor unavailable after upgrade" },
      occurredAt: "2026-09-13T00:00:03Z"
    });
    await storeAfterUpgrade.saveAcquisitionFailure(routeFailure);
    await storeAfterUpgrade.saveAcquisitionFailure(routeFailure);
    expect(await storeAfterUpgrade.listAcquisitionFailures({
      tenantId: "tenant",
      resourceId: "resource",
      candidateId: "candidate"
    })).toEqual([routeFailure]);
    expect((await storeAfterUpgrade.listWorkflowCandidates("resource")).filter((candidate) => candidate.state === "ACTIVE")).toHaveLength(1);
  }, 30_000);

  async function setup() {
    const { db } = await setupThrough("0020_workflow_finalization_outcomes.sql");
    await seedAgentRun(db);
    return { db, store: new D1WorkflowRepository(db) };
  }
});

const MIGRATIONS = [
  "0001_initial.sql",
  "0002_briefing_language_pause.sql",
  "0003_briefing_starred.sql",
  "0004_briefing_stars.sql",
  "0005_briefing_votes.sql",
  "0006_accounts.sql",
  "0007_sources_apify_intensity.sql",
  "0008_event_deduplication.sql",
  "0009_daily_budget_costs.sql",
  "0010_briefing_editions.sql",
  "0011_agent_runtime.sql",
  "0012_agent_runtime_security_and_provenance.sql",
  "0013_web_operator_workflow_lifecycle.sql",
  "0014_web_operator_workflow_failure_evidence.sql",
  "0015_web_operator_acquisition_failure_evidence.sql",
  "0016_model_attempt_timeout_provenance.sql",
  "0017_web_operator_live_smoke_requests.sql",
  "0018_model_gateway_diagnostics.sql",
  "0019_openrouter_model_diagnostic.sql",
  "0020_workflow_finalization_outcomes.sql"
];

async function setupThrough(lastMigration: string) {
  mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
  const db = await mf.getD1Database("DB");
  for (const migration of MIGRATIONS.slice(0, MIGRATIONS.indexOf(lastMigration) + 1)) await applyMigration(db, migration);
  return { db };
}

async function applyMigration(db: D1Database, migration: string) {
  const sql = (await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean)) {
    if (!/\S/.test(statement)) continue;
    await db.prepare(statement).run();
  }
}

async function seedAgentRun(db: D1Database) {
  await db.prepare(`INSERT INTO agent_runs
    (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
    VALUES ('run','tenant','resource','key','candidate','https://fixture.test/article','fixture','attempt','Acquire','known_candidate','completed',1,'policy','contract','2026-09-13T00:00:00Z','2026-09-13T00:00:00Z')`).run();
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(tableName).first();
  return Boolean(row);
}

function captureBundle(resourceId: string, suffix: string): WorkflowCaptureBundle {
  return {
    id: makeId("workflow_capture", resourceId, suffix),
    runId: "run",
    tenantId: "tenant",
    resourceId,
    candidate: candidate(),
    actions: [{
      tool: "browser.extract@1",
      arguments: {},
      observationAfterId: `observation-${suffix}`,
      effectCertainty: "known_applied",
      browserGeneration: 1,
      occurredAt: "2026-09-13T00:00:00Z"
    }],
    observationIds: [`observation-${suffix}`],
    acceptedContentId: `accepted-${suffix}`,
    successfulAlternatives: ["browser.extract@1"],
    failedAlternatives: [],
    discoveryEvidence: {
      canonicalResourceIdentity: {
        resourceId,
        candidateCanonicalUrl: "https://fixture.test/article",
        publisherId: "fixture"
      },
      listingUrlCandidates: ["https://fixture.test/section"],
      paginationBehavior: {
        watermarkObserved: true,
        exhausted: true,
        evidenceObservationIds: [`observation-${suffix}`]
      },
      articleUrlPatterns: ["https://fixture.test/{slug}"],
      publicationTimeEvidence: [{ observationId: `observation-${suffix}`, publisherTimestamp: "2026-09-13T00:00:00Z" }],
      pageTypeObservations: [{ observationId: `observation-${suffix}`, url: "https://fixture.test/article", pageType: "article", title: "Article" }],
      locatorEvidence: [],
      requiredReadCapabilities: [],
      stoppingWatermarkEvidence: [{ observationId: `observation-${suffix}`, url: "https://fixture.test/article", watermarkObserved: true, exhausted: true }]
    },
    extractionEvidence: [{ observationId: `observation-${suffix}`, canonicalUrl: "https://fixture.test/article", contentHash: "hash" }],
    completionEvidence: { citedObservationIds: [`observation-${suffix}`], watermarkObserved: true },
    runtime: { softwareVersion: "test", toolSchemaVersion: "tools", workflowSchemaVersion: "workflow-capture-v1" },
    createdAt: "2026-09-13T00:00:00Z"
  };
}

function workflowCandidate(capture: WorkflowCaptureBundle, version: number): WorkflowCandidate {
  return {
    id: makeId("workflow_candidate", capture.id),
    tenantId: capture.tenantId,
    resourceId: capture.resourceId,
    sourceCaptureId: capture.id,
    candidate: candidate(),
    state: "CANDIDATE",
    version,
    operations: [{
      id: makeId("workflow_operation", capture.id),
      kind: "extract_article",
      locatorAlternatives: [{ kind: "article_canonical", value: "https://fixture.test/article", confidence: 1 }],
      expected: { candidateCanonicalUrl: "https://fixture.test/article" }
    }],
    unsupportedGaps: [],
    createdAt: "2026-09-13T00:00:00Z"
  };
}

function candidate() {
  return {
    candidateId: "candidate",
    canonicalUrl: "https://fixture.test/article",
    publisherId: "fixture",
    acquisitionAttempt: "attempt"
  };
}
