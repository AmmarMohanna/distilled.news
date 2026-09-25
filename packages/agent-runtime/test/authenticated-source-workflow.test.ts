import { describe, expect, it } from "vitest";
import { DeterministicAuthenticatedSourceWorkflowExecutor, type AuthenticatedSourceTimelineObservation, type AuthenticatedSourceWorkflowPlan, type AuthenticatedSourceWorkflowPort } from "../src/authenticated-source-workflow";
import type { AcquiredSourceItem, SourceAcquisitionRequest } from "../src/temporal-acquisition";

const origin = "https://x.example";
const request: SourceAcquisitionRequest = {
  source: { canonicalSourceUrl: `${origin}/home`, sourceFamily: "synthetic-auth" },
  window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" },
  acquisitionAsOf: "2026-09-23T00:00:00Z",
  limits: { maxItems: 20, maxPages: 5, maxScrolls: 5, maxPhysicalAttempts: 20, maxExecutionMs: 10_000 },
  authentication: "AUTH_REQUIRED"
};
const plan: AuthenticatedSourceWorkflowPlan = { version: 1, entryUrl: `${origin}/home`, allowedOrigins: [origin], continuation: { kind: "SCROLL", deltaY: 900, terminalEvidence: "START_BOUNDARY_OR_EXHAUSTION" }, readOnly: true };
function item(id: string, publishedAt: string): AcquiredSourceItem { return { sourceResource: origin, sourceItemId: id, canonicalItemUrl: `${origin}/status/${id}`, title: id, text: `post ${id}`, publishedAt, acquisitionEvidence: { timestampSource: "trusted_fixture" } }; }
function observation(items: AcquiredSourceItem[], done = false): AuthenticatedSourceTimelineObservation { return { url: `${origin}/home`, pageRevision: String(items.map((value) => value.sourceItemId).join(",")), items, sourceExhausted: done }; }

describe("deterministic authenticated source workflow", () => {
  it("restores an authenticated browser, scrolls a timeline, deduplicates posts, and preserves temporal coverage", async () => {
    let scrolls = 0, closes = 0;
    const port: AuthenticatedSourceWorkflowPort = {
      async open() {},
      async observe() { return observation([item("new", "2026-09-21T12:00:00Z"), item("duplicate", "2026-09-21T10:00:00Z")]); },
      async scrollAndObserve() { scrolls++; return observation([item("duplicate", "2026-09-21T10:00:00Z"), item("old", "2026-09-19T23:59:00Z")], true); },
      async close() { closes++; }
    };
    const result = await new DeterministicAuthenticatedSourceWorkflowExecutor(port).execute(request, plan);
    expect(result.items.map((value) => value.sourceItemId)).toEqual(["new", "duplicate"]);
    expect(result.coverage).toMatchObject({ rangeCovered: true, truncated: false, stopReason: "SOURCE_EXHAUSTED" });
    expect(result.provenance?.mechanism).toBe("deterministic_authenticated_browser");
    expect(scrolls).toBe(1);
    expect(closes).toBe(1);
  });

  it("does not bypass an authentication challenge and always closes", async () => {
    let closes = 0;
    const port: AuthenticatedSourceWorkflowPort = {
      async open() {},
      async observe() { return { ...observation([]), challengeState: "CHALLENGE_REQUIRED" as const }; },
      async close() { closes++; }
    };
    const result = await new DeterministicAuthenticatedSourceWorkflowExecutor(port).execute(request, { ...plan, continuation: { kind: "NONE", terminalEvidence: "UNPROVEN" } });
    expect(result.coverage.stopReason).toBe("CHALLENGE_REQUIRED");
    expect(result.coverage.rangeCovered).toBe(false);
    expect(closes).toBe(1);
  });

  it("rejects public requests and non-read-only plans", async () => {
    const port: AuthenticatedSourceWorkflowPort = { async open() {}, async observe() { return observation([]); }, async close() {} };
    await expect(new DeterministicAuthenticatedSourceWorkflowExecutor(port).execute({ ...request, authentication: "PUBLIC" }, plan)).rejects.toThrow("AUTH_REQUIRED");
    await expect(new DeterministicAuthenticatedSourceWorkflowExecutor(port).execute(request, { ...plan, readOnly: false as true })).rejects.toThrow("read-only");
  });
});
