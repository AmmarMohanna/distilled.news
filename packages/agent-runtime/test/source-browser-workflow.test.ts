import { describe, expect, it } from "vitest";
import type { PublicBrowserObservation } from "../src/browser";
import { DeterministicSourceBrowserWorkflowExecutor, type SourceBrowserWorkflowPlan, type SourceBrowserWorkflowPort } from "../src/source-browser-workflow";
import type { SourceAcquisitionRequest } from "../src/temporal-acquisition";

const origin = "https://publisher.example";
const request: SourceAcquisitionRequest = {
  source: { canonicalSourceUrl: `${origin}/news` },
  window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" },
  acquisitionAsOf: "2026-09-23T00:00:00Z",
  limits: { maxItems: 20, maxPages: 5, maxScrolls: 5, maxPhysicalAttempts: 20, maxExecutionMs: 10_000 },
  authentication: "PUBLIC"
};
const plan: SourceBrowserWorkflowPlan = {
  version: 1,
  entryUrl: `${origin}/news`,
  allowedOrigins: [origin],
  articlePathPrefix: "/article/",
  continuation: { kind: "NEXT_LINK", label: "Next", role: "link", terminalEvidence: "ABSENT_AFTER_VALIDATED_PAGINATION" }
};
function link(url: string, label = "Article") {
  return { handle: url, kind: "link" as const, role: "link", label, safeAction: "follow" as const, destinationUrl: url };
}
function listing(url: string, links: string[], next?: string): PublicBrowserObservation {
  return { url, title: "News", pageRevision: url, visibleText: "", controls: [...links.map((value) => link(value)), ...(next ? [link(next, "Next")] : [])] };
}
function article(id: string, publishedAt: string): PublicBrowserObservation {
  const url = `${origin}/article/${id}`;
  return { url, title: id, pageRevision: id, visibleText: "", controls: [], article: { canonicalUrl: url, title: id, body: `Full body ${id}`, excerpt: id, publisherTimestamp: publishedAt } };
}
function fixture(pages: Map<string, PublicBrowserObservation>) {
  const visits: string[] = [];
  let opens = 0, closes = 0;
  const port: SourceBrowserWorkflowPort = {
    async open() { opens++; },
    async navigateAndObserve(url) { visits.push(url); const observed = pages.get(url); if (!observed) throw new Error("fixture missing observation"); return observed; },
    async close() { closes++; }
  };
  return { port, visits, get opens() { return opens; }, get closes() { return closes; } };
}

describe("deterministic multi-item browser workflow", () => {
  it("traverses listings and articles, deduplicates, applies [start,end), and proves validated exhaustion", async () => {
    const page2 = `${origin}/news?page=2`;
    const fixturePages = new Map<string, PublicBrowserObservation>([
      [plan.entryUrl, listing(plan.entryUrl, [`${origin}/article/new`, `${origin}/article/a`, `${origin}/article/b`], page2)],
      [page2, listing(page2, [`${origin}/article/b`, `${origin}/article/old`])],
      [`${origin}/article/new`, article("new", request.window.endTime)],
      [`${origin}/article/a`, article("a", "2026-09-21T12:00:00Z")],
      [`${origin}/article/b`, article("b", request.window.startTime)],
      [`${origin}/article/old`, article("old", "2026-09-19T23:59:59Z")]
    ]);
    const first = fixture(fixturePages);
    const result = await new DeterministicSourceBrowserWorkflowExecutor(first.port).execute(request, plan);
    expect(result.items.map((item) => item.canonicalItemUrl)).toEqual([`${origin}/article/a`, `${origin}/article/b`]);
    expect(result.items.every((item) => item.text?.startsWith("Full body"))).toBe(true);
    expect(result.coverage).toMatchObject({ rangeCovered: true, truncated: false, stopReason: "SOURCE_EXHAUSTED" });
    expect(result.continuation).toMatchObject({ pageCount: 2, uniqueCanonicalUrls: 4 });
    expect(first.visits.filter((url) => url.endsWith("/article/b"))).toHaveLength(1);
    expect([first.opens, first.closes]).toEqual([1, 1]);
    const replay = fixture(fixturePages);
    const again = await new DeterministicSourceBrowserWorkflowExecutor(replay.port).execute(request, plan);
    expect(again.items).toEqual(result.items);
    expect(again.coverage).toEqual(result.coverage);
    expect([replay.opens, replay.closes]).toEqual([1, 1]);
  });

  it("never claims coverage when pagination is unproven or a budget ends traversal", async () => {
    const pages = new Map<string, PublicBrowserObservation>([[plan.entryUrl, listing(plan.entryUrl, [`${origin}/article/a`])], [`${origin}/article/a`, article("a", "2026-09-21T00:00:00Z")]]);
    const unproven = fixture(pages);
    const result = await new DeterministicSourceBrowserWorkflowExecutor(unproven.port).execute(request, { ...plan, continuation: { kind: "NONE", terminalEvidence: "UNPROVEN" } });
    expect(result.coverage).toMatchObject({ rangeCovered: false, truncated: true, stopReason: "SOURCE_PAGINATION_EXHAUSTED" });
    const limited = fixture(pages);
    const budget = await new DeterministicSourceBrowserWorkflowExecutor(limited.port).execute({ ...request, limits: { ...request.limits, maxPages: 1 } }, plan);
    expect(budget.coverage.rangeCovered).toBe(false);
    expect([unproven.closes, limited.closes]).toEqual([1, 1]);
    const physical = fixture(pages);
    const exhausted = await new DeterministicSourceBrowserWorkflowExecutor(physical.port).execute({ ...request, limits: { ...request.limits, maxPhysicalAttempts: 1 } }, plan);
    expect(exhausted.coverage.stopReason).toBe("EXECUTION_BUDGET_REACHED");
    expect(exhausted.continuation?.physicalAttempts).toBe(1);
  });

  it("uses fixed acquisitionAsOf and always closes after a failed trusted observation", async () => {
    const pages = new Map<string, PublicBrowserObservation>([[plan.entryUrl, listing(plan.entryUrl, [`${origin}/article/a`])], [`${origin}/article/a`, article("a", "2026-09-22T01:00:00Z")]]);
    const fixed = fixture(pages);
    const future = await new DeterministicSourceBrowserWorkflowExecutor(fixed.port, () => { throw new Error("clock must not be called"); }).execute({ ...request, window: { ...request.window, endTime: "2026-09-25T00:00:00Z" }, acquisitionAsOf: "2026-09-22T00:00:00Z" }, { ...plan, continuation: { kind: "NONE", terminalEvidence: "UNPROVEN" } });
    expect(future.effectiveWindow.endTime).toBe("2026-09-22T00:00:00.000Z");
    expect(future.items).toHaveLength(0);
    expect(fixed.closes).toBe(1);
    const failing = fixture(new Map());
    await expect(new DeterministicSourceBrowserWorkflowExecutor(failing.port).execute(request, plan)).rejects.toThrow("fixture missing observation");
    expect(failing.closes).toBe(1);
  });
});
