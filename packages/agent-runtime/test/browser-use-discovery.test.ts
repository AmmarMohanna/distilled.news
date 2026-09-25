import { describe, expect, it, vi } from "vitest";
import { BrowserUseDiscoveryBackend, type BrowserUseDiscoveryProposal } from "../src/browser-use-discovery";

const capability = { runId: "run-1", tenantId: "tenant", ownerId: "owner", resourceId: "source", browserGeneration: 1, allowedOrigins: ["https://news.example"], siteKind: "PUBLIC" as const, readOnly: true as const, expiresAt: "2026-09-26T00:00:00Z" };
const proposal: BrowserUseDiscoveryProposal = { protocol: "distilled.browser-use.discovery.v1", runId: "run-1", visitedUrls: ["https://news.example/", "https://news.example/a"], listingUrls: ["https://news.example/"], articleUrls: ["https://news.example/a"], continuation: "scroll", timestampHints: [], steps: 3, challengeObserved: false };

describe("Browser Use discovery boundary", () => {
  it("passes only bounded discovery into the Distilled compiler", async () => {
    const compile = vi.fn(async () => ({ id: "candidate", version: 1, state: "CANDIDATE" as const, execute: vi.fn() }));
    const result = await new BrowserUseDiscoveryBackend({ discover: async () => proposal }, { compile }).discover({ request: {} as never, capability });
    expect(result.candidate.id).toBe("candidate");
    expect(result.modelCalls).toBe(3);
    expect(compile).toHaveBeenCalledOnce();
  });
  it("rejects off-origin, unvisited and challenged claims before compilation", async () => {
    const compile = vi.fn();
    for (const changed of [
      { articleUrls: ["https://evil.example/a"] },
      { articleUrls: ["https://news.example/unvisited"] },
      { challengeObserved: true }
    ]) {
      await expect(new BrowserUseDiscoveryBackend({ discover: async () => ({ ...proposal, ...changed }) }, { compile }).discover({ request: {} as never, capability })).rejects.toThrow();
    }
    expect(compile).not.toHaveBeenCalled();
  });
});
