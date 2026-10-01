import { describe, expect, it } from "vitest";
import { executeXWorkflow } from "./authenticated-x-acquisition";
import type { Env } from "./types";
import type { SourceAcquisitionRequest, WorkflowCandidate } from "@distilled/agent-runtime";

const sourceUrl = "https://x.com/source";
const context = { tenantId: "owner", ownerId: "owner", profileId: "authenticated_profile_fixture", resourceId: "resource-x", runId: "x-recovery", idempotencyKey: "x-recovery" };
const request = {
  tenantId: "owner", ownerId: "owner", resourceId: "resource-x",
  source: { sourceFamily: "x", canonicalSourceUrl: sourceUrl },
  window: { startTime: "2026-09-25T00:00:00Z", endTime: "2026-09-28T00:00:00Z" },
  limits: { maxItems: 2, maxPages: 2, maxScrolls: 1, maxPhysicalAttempts: 3, maxExecutionMs: 10_000 },
  authentication: "AUTH_REQUIRED", acquisitionAsOf: "2026-09-27T12:00:00Z"
} as SourceAcquisitionRequest;
const workflow = { id: "workflow-x", version: 1, authenticatedSourceAcquisition: {
  version: 1, entryUrl: sourceUrl, allowedOrigins: ["https://x.com"],
  continuation: { kind: "NONE", terminalEvidence: "VALIDATED_SINGLE_PAGE" }, readOnly: true
} } as WorkflowCandidate;

describe("authenticated X challenge recovery", () => {
  it("retries a challenge, fails over the executor, and resumes from trusted content", async () => {
    const events: Array<{ recoveryState: string; attempt: number }> = [];
    const providers: Array<string | undefined> = [];
    const env = {
      DISTILLED_BROWSER_PROVIDER: "cloudflare_container",
      SELF_HOSTED_BROWSER_BRIDGE_URL: "https://bridge.example.test/v1/authenticated-browser",
      SELF_HOSTED_BROWSER_BRIDGE_AUTH: "test-only",
      DB: { prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => { events.push(JSON.parse(args[4] as string)); } }) }) }
    } as unknown as Env;
    const outcome = await executeXWorkflow(env, context, request, workflow, undefined, (attempt, provider) => {
      providers.push(provider);
      return {
        async open() {},
        async observe() { return attempt < 2
          ? { url: sourceUrl, pageRevision: `challenge-${attempt}`, items: [], challengeState: "CHALLENGE_REQUIRED" as const }
          : { url: sourceUrl, pageRevision: "clear", items: [{ sourceResource: sourceUrl, sourceItemId: "1234567890", canonicalItemUrl: `${sourceUrl}/status/1234567890`, publishedAt: "2026-09-27T10:00:00Z", text: "Verified post", acquisitionEvidence: { kind: "CDP_DOM_SNAPSHOT" as const, pageRevision: "clear" } }], sourceExhausted: true, challengeState: "NO_CHALLENGE" as const }; },
        async scrollAndObserve() { throw new Error("unexpected scroll"); },
        async close() {},
        async discoverWithBrowserUse() { throw new Error("unexpected discovery"); }
      };
    });
    expect(outcome.status).toBe("SUCCESS");
    expect(outcome.result?.items).toHaveLength(1);
    expect(providers).toEqual([undefined, undefined, "self_hosted"]);
    expect(events.map(event => event.recoveryState)).toEqual(["CHALLENGE_DETECTED", "CHALLENGE_HANDLING", "SESSION_RESTORE", "CHALLENGE_HANDLING", "EXECUTOR_FAILOVER", "SESSION_RESTORE", "CHALLENGE_CLEARED", "ACQUISITION_RESUMED"]);
  });
  it("does not classify an unresolved generic challenge as owner assistance", async () => {
    const events: Array<{ recoveryState: string }> = [];
    const env = {
      DISTILLED_BROWSER_PROVIDER: "cloudflare_container",
      DB: { prepare: () => ({ bind: (...args: unknown[]) => ({ run: async () => { events.push(JSON.parse(args[4] as string)); } }) }) }
    } as unknown as Env;
    const port = {
      async open() {},
      async observe() { return { url: sourceUrl, pageRevision: "login-wall", items: [], challengeState: "LOGIN_REQUIRED" as const }; },
      async scrollAndObserve() { throw new Error("unexpected scroll"); },
      async close() {},
      async discoverWithBrowserUse() { throw new Error("unexpected discovery"); }
    };
    const outcome = await executeXWorkflow(env, context, request, workflow, port);
    expect(outcome.status).toBe("AUTH_REQUIRED");
    expect(events.map(event => event.recoveryState)).toEqual(["CHALLENGE_DETECTED", "AUTOMATED_ROUTES_EXHAUSTED"]);
  });
});
