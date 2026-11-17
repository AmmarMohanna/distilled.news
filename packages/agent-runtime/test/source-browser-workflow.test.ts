import { describe, expect, it } from "vitest";
import type { PublicBrowserObservation } from "../src/browser";
import { compileSourceBrowserWorkflowPlan, DeterministicSourceBrowserWorkflowExecutor, type SourceBrowserWorkflowPlan, type SourceBrowserWorkflowPort } from "../src/source-browser-workflow";
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
  return { url, title: id, pageRevision: id, visibleText: "", controls: [], article: { canonicalUrl: url, title: id, body: `Full body ${id} `.repeat(12), excerpt: id, publisherTimestamp: publishedAt } };
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
  it("compiles source-neutral link/continuation evidence only from trusted observations", () => {
    const evidence = { sourceUrl: `${origin}/news`, listing: listing(`${origin}/news`, [`${origin}/article/a`, `${origin}/article/b`]), sampledArticles: [article("a", "2026-09-21T00:00:00Z"), article("b", "2026-09-20T00:00:00Z")] };
    expect(compileSourceBrowserWorkflowPlan(evidence)).toMatchObject({ articlePathPrefix: "/article/", continuation: { kind: "NONE", terminalEvidence: "UNPROVEN" } });
    expect(compileSourceBrowserWorkflowPlan({ ...evidence, sampledArticles: [article("a", "2026-09-21T00:00:00Z")] })).toBeUndefined();
    expect(compileSourceBrowserWorkflowPlan({ ...evidence, sampledArticles: evidence.sampledArticles.map(value => ({ ...value, article: { ...value.article!, body: "aj-logo Loading..." } })) })).toBeUndefined();
    expect(compileSourceBrowserWorkflowPlan({ ...evidence, afterScroll: { ...evidence.listing, pageRevision: "scrolled", controls: [...evidence.listing.controls, link(`${origin}/article/c`)] } })).toMatchObject({ continuation: { kind: "SCROLL" } });
    expect(compileSourceBrowserWorkflowPlan({ ...evidence, listing: { ...evidence.listing, controls: [], listingLinks: [`${origin}/article/a`, `${origin}/article/b`] }, afterScroll: { ...evidence.listing, controls: [], listingLinks: [`${origin}/article/a`, `${origin}/article/b`, `${origin}/article/c`], pageRevision: "scrolled" } })).toMatchObject({ continuation: { kind: "SCROLL" } });
  });
  it("keeps dated item paths reusable across later acquisition windows", async () => {
    const dated=(day:string,id:string)=>`${origin}/blogs/2026/9/${day}/${id}`;
    const listingPage=listing(`${origin}/news`,[dated("27","a"),dated("28","b")]);
    const samples=[
      {...article("a","2026-09-27T12:00:00Z"),url:dated("27","a"),article:{...article("a","2026-09-27T12:00:00Z").article!,canonicalUrl:dated("27","a")}},
      {...article("b","2026-09-28T12:00:00Z"),url:dated("28","b"),article:{...article("b","2026-09-28T12:00:00Z").article!,canonicalUrl:dated("28","b")}}
    ];
    const compiled=compileSourceBrowserWorkflowPlan({sourceUrl:`${origin}/news`,listing:listingPage,sampledArticles:samples});
    expect(compiled?.articlePathPrefix).toBe("/blogs/");
    const legacy={...compiled!,articlePathPrefix:"/blogs/2026/9/27/"};
    const pages=new Map<string,PublicBrowserObservation>([[listingPage.url,listingPage],...samples.map(value=>[value.url,value] as const)]);
    const result=await new DeterministicSourceBrowserWorkflowExecutor(fixture(pages).port).execute({...request,window:{startTime:"2026-09-28T00:00:00Z",endTime:"2026-09-29T00:00:00Z"},acquisitionAsOf:"2026-09-29T01:00:00Z"},legacy);
    expect(result.items.map(value=>value.canonicalItemUrl)).toEqual([dated("28","b")]);
  });
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

  it("does not return a timestamped loading placeholder as article content", async () => {
    const url=`${origin}/article/shell`;
    const shell={...article("shell","2026-09-21T00:00:00Z"),article:{...article("shell","2026-09-21T00:00:00Z").article!,body:"aj-logo Loading..."}};
    const pages=new Map<string,PublicBrowserObservation>([[plan.entryUrl,listing(plan.entryUrl,[url])],[url,shell]]);
    const result=await new DeterministicSourceBrowserWorkflowExecutor(fixture(pages).port).execute(request,{...plan,continuation:{kind:"NONE",terminalEvidence:"UNPROVEN"}});
    expect(result.items).toHaveLength(0);
    expect(result.coverage.rangeCovered).toBe(false);
  });

  it("restores listing scroll depth after article navigation and does not scroll the article", async () => {
    let current = "";
    let scrollDepth = 0;
    const scrollContexts: string[] = [];
    const port: SourceBrowserWorkflowPort = {
      async open() {},
      async navigateAndObserve(url) {
        current = url;
        if (url === plan.entryUrl) { scrollDepth = 0; return listing(url, [`${origin}/article/a`]); }
        return article(url.split("/").at(-1)!, url.endsWith("/a") ? "2026-09-21T00:00:00Z" : "2026-09-19T00:00:00Z");
      },
      async scrollAndObserve() {
        scrollContexts.push(current);
        if (current !== plan.entryUrl) throw new Error("scroll attempted on article");
        scrollDepth++;
        return listing(plan.entryUrl, scrollDepth === 1 ? [`${origin}/article/a`, `${origin}/article/b`] : [`${origin}/article/a`, `${origin}/article/b`]);
      },
      async close() {}
    };
    const result = await new DeterministicSourceBrowserWorkflowExecutor(port).execute(request, { ...plan, continuation: { kind: "SCROLL", deltaY: 1200, terminalEvidence: "UNPROVEN" } });
    expect(scrollContexts).toEqual([plan.entryUrl, plan.entryUrl, plan.entryUrl, plan.entryUrl]);
    expect(result.items.map((item) => item.canonicalItemUrl)).toEqual([`${origin}/article/a`]);
    expect(result.coverage).toMatchObject({ rangeCovered: false, stopReason: "SOURCE_PAGINATION_EXHAUSTED" });
  });

  it("acquires items inserted only after successive listing scrolls", async () => {
    let current = "", depth = 0;
    const visits: string[] = [];
    const port: SourceBrowserWorkflowPort = {
      async open() {},
      async navigateAndObserve(url) {
        current = url; visits.push(url);
        if (url === plan.entryUrl) { depth = 0; return listing(url, []); }
        return article(url.split("/").at(-1)!, "2026-09-21T12:00:00Z");
      },
      async scrollAndObserve() {
        if (current !== plan.entryUrl) throw new Error("scroll attempted on article");
        depth++;
        return listing(plan.entryUrl, depth === 1 ? [] : depth === 2 ? [`${origin}/article/a`] : [`${origin}/article/b`]);
      },
      async close() {}
    };
    const result = await new DeterministicSourceBrowserWorkflowExecutor(port).execute({ ...request, limits: { ...request.limits, maxItems: 2, maxScrolls: 3 } }, { ...plan, continuation: { kind: "SCROLL", deltaY: 1200, terminalEvidence: "UNPROVEN" } });
    expect(result.items.map(value => value.canonicalItemUrl)).toEqual([`${origin}/article/a`, `${origin}/article/b`]);
    expect(visits.filter(url => url === plan.entryUrl)).toHaveLength(2);
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
