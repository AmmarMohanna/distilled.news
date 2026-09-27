import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { D1BrowserUseRunTelemetry } from "./browser-use-run-telemetry";

describe("durable bounded Browser Use telemetry", () => {
  it("survives a fresh store, retains first-run counters, and never stores secret-bearing fields", async () => {
    const mf = new Miniflare({ modules: true, script: "export default {fetch(){return new Response('ok')}}", d1Databases: ["DB"] });
    try {
      const db = await mf.getD1Database("DB");
      const sql = readFileSync(new URL("../migrations/0028_browser_use_discovery_runs.sql", import.meta.url), "utf8");
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
      const first = new D1BrowserUseRunTelemetry(db);
      await first.begin({ runId: "run_browser_use", acquisitionRunId: "run", tenantId: "owner", resourceId: "resource", startedAt: "2026-09-27T12:00:00.000Z" });
      await first.stage("run_browser_use", "PROPOSAL_ACCEPTED", { modelCalls: 6, browserOperations: 17, agentBrowserActions: 8, agentDurationMs: 1200 });
      await first.stage("run_browser_use", "VERIFIED", { verificationDurationMs: 900 });
      await first.stage("run_browser_use", "ACTIVE");
      await first.completeAcquisition("run", "SUCCESS", "2026-09-27T12:00:03.000Z");
      const fresh = new D1BrowserUseRunTelemetry(db);
      expect(await fresh.get("run_browser_use")).toMatchObject({ state: "ACTIVE", outcome: "SUCCESS", browserUseDiscoveryRuns: 1, discoveryModelCalls: 6, browserOperations: 17, agentBrowserActions: 8, totalDurationMs: 3000, agentDurationMs: 1200, verificationDurationMs: 900 });
      await fresh.completeAcquisition("run", "STRUCTURAL_FAILURE", "2026-09-27T12:00:05.000Z");
      expect((await fresh.get("run_browser_use"))?.outcome).toBe("SUCCESS");
      const columns = await db.prepare("PRAGMA table_info(browser_use_discovery_runs)").all<{ name: string }>();
      expect(columns.results.map(value => value.name).join("|")).not.toMatch(/prompt|response|cookie|token|credential|authorization|session/i);
    } finally { await mf.dispose(); }
  });
});
