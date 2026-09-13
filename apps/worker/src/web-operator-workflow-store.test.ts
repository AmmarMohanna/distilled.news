import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { makeId, type AcquisitionEvaluationMetrics, type WorkflowCaptureBundle, type WorkflowCandidate } from "@distilled/agent-runtime";
import { D1WorkflowRepository } from "./web-operator-workflow-store";

describe("D1 Web Operator workflow lifecycle store", () => {
  let mf: Miniflare | undefined;
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
    await store.markWorkflow(replacement.id, "ROLLED_BACK");
    expect(await store.getActiveWorkflow("resource")).toBeNull();

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

  async function setup() {
    mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    const db = await mf.getD1Database("DB");
    for (const migration of [
      "0011_agent_runtime.sql",
      "0012_agent_runtime_security_and_provenance.sql",
      "0013_web_operator_workflow_lifecycle.sql"
    ]) await applyMigration(db, migration);
    await db.prepare(`INSERT INTO agent_runs
      (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
      VALUES ('run','tenant','resource','key','candidate','https://fixture.test/article','fixture','attempt','Acquire','known_candidate','completed',1,'policy','contract','2026-09-13T00:00:00Z','2026-09-13T00:00:00Z')`).run();
    return { db, store: new D1WorkflowRepository(db) };
  }
});

async function applyMigration(db: D1Database, migration: string) {
  const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
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
