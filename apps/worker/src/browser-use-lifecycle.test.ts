import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { compileSourceBrowserWorkflowPlan, type PublicBrowserObservation, type SourceAcquisitionRequest } from "@distilled/agent-runtime";
import { compileVerifiedBrowserUseDiscovery } from "./public-source-discovery";
import { D1WorkflowRepository } from "./web-operator-workflow-store";
import type { Env } from "./types";

describe("verified Browser Use source workflow lifecycle", () => {
  it("persists a truthful Browser Use capture and promotes the trusted source plan", async () => {
    const mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    try {
      const db = await mf.getD1Database("DB");
      for (const name of ["0011_agent_runtime.sql", "0013_web_operator_workflow_lifecycle.sql", "0028_browser_use_discovery_runs.sql","0031_bounded_decision_events.sql","0032_openrouter_decision_metadata.sql"]) {
        const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8").replace(/^PRAGMA foreign_keys = ON;\s*/m, "");
        for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value => value.trim()).filter(Boolean))
          await db.prepare(statement).run();
      }
      const source = "https://news.example/listing";
      const urls = ["a", "b"].map(id => `https://news.example/article/${id}`);
      const listing: PublicBrowserObservation = { url: source, title: "Listing", pageRevision: "listing-1", visibleText: "", controls: [], listingLinks: [] };
      const afterScroll: PublicBrowserObservation = { ...listing, pageRevision: "listing-2", listingLinks: urls };
      const sampledArticles: PublicBrowserObservation[] = urls.map((url, index) => ({ url, title: `Story ${index}`, pageRevision: `article-${index}`, visibleText: "", controls: [], article: { canonicalUrl: url, title: `Story ${index}`, body: `Verified body ${index} contains substantive independently observed article content. `.repeat(3), excerpt: "", publisherTimestamp: `2026-09-2${index}T12:00:00Z` } }));
      const evidence = { sourceUrl: source, listing, afterScroll, sampledArticles };
      const plan = compileSourceBrowserWorkflowPlan(evidence)!;
      const request: SourceAcquisitionRequest = { source: { canonicalSourceUrl: source }, window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" }, limits: { maxItems: 2, maxPages: 3, maxScrolls: 3, maxPhysicalAttempts: 20, maxExecutionMs: 90_000 }, authentication: "PUBLIC" };
      const discovery = await compileVerifiedBrowserUseDiscovery({ DB: db } as Env, { request, tenantId: "tenant", ownerId: "owner", resourceId: "resource", runId: "run", idempotencyKey: "first-run" }, { evidence, plan, candidateUrl: urls[0], browserOperations: 6, discoveryModelCalls: 2, agentRunId: "real_browser_use_run" });
      const repository = new D1WorkflowRepository(db);
      const candidate = await repository.getWorkflowCandidate(discovery.candidate.id);
      expect(candidate?.state).toBe("CANDIDATE");
      expect((await repository.getCaptureBundle(candidate!.sourceCaptureId))?.extractionEvidence).toHaveLength(2);
      const validated = await discovery.validate(discovery.candidate);
      expect((await repository.getWorkflowCandidate(candidate!.id))?.state).toBe("VALIDATED");
      await discovery.activate(validated);
      const freshRepository = new D1WorkflowRepository(db);
      expect((await freshRepository.getActiveWorkflow("resource"))?.sourceAcquisition).toEqual(plan);
      expect(discovery.modelCalls).toBe(2);
    } finally { await mf.dispose(); }
  });
});
