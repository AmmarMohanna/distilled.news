import { describe, expect, it, vi } from "vitest";
import { BrowserUseDiscoveryBackend, verifyBrowserUseProposal, type BrowserUseDiscoveryProposal } from "../src/browser-use-discovery";
import type { PublicBrowserObservation } from "../src/browser";
import { assertBridgeRequestShape } from "../src/authenticated-browser-bridge";

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
  it("uses measured model and fenced action counts when the Python runner reports them", async () => {
    const compile = vi.fn(async () => ({ id: "candidate", version: 1, state: "CANDIDATE" as const, execute: vi.fn() }));
    const measured = { ...proposal, modelCalls: 2, browserActions: 5, agentBrowserActions: 2 };
    const result = await new BrowserUseDiscoveryBackend({ discover: async () => measured }, { compile }).discover({ request: {} as never, capability });
    expect(result.modelCalls).toBe(2);
    expect(result.browserOperations).toBe(5);
    await expect(new BrowserUseDiscoveryBackend({ discover: async () => ({ ...measured, modelCalls: 33 }) }, { compile }).propose({ request: {} as never, capability })).rejects.toThrow("invalid_browser_use_proposal");
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
  it("rejects malformed and oversized agent output before trusted observation", async () => {
    const compile = vi.fn();
    const outputs = [
      { ...proposal, visitedUrls: "not-an-array" },
      { ...proposal, timestampHints: Array.from({ length: 33 }, () => "2026-09-20") },
      { ...proposal, steps: 500 },
      { ...proposal, articleUrls: ["http://127.0.0.1/private"] }
    ];
    for (const output of outputs) await expect(new BrowserUseDiscoveryBackend({ discover: async () => output as never }, { compile }).discover({ request: {} as never, capability })).rejects.toThrow();
    expect(compile).not.toHaveBeenCalled();
  });
  it("compiles only independently observed article links and dated bodies", async () => {
    const a = "https://news.example/article/a", b = "https://news.example/article/b";
    const listing: PublicBrowserObservation = { url: "https://news.example/", title: "News", pageRevision: "listing", visibleText: "", controls: [a, b].map(url => ({ handle: url, kind: "link", role: "link", label: "Article", safeAction: "follow", destinationUrl: url })) };
    const pages = new Map<string, PublicBrowserObservation>([[listing.url, listing], ...[a, b].map((url, index) => [url, { url, title: "Article", pageRevision: url, visibleText: "", controls: [], article: { canonicalUrl: url, title: "Article", body: "Verified full body", excerpt: "", publisherTimestamp: `2026-09-${20 + index}T00:00:00Z` } } as PublicBrowserObservation] as const)]);
    let closes = 0;
    const port = { open: async () => {}, navigateAndObserve: async (url: string) => { const result = pages.get(url); if (!result) throw new Error("missing fixture"); return result; }, close: async () => { closes++; } };
    const request = { source: { canonicalSourceUrl: listing.url }, limits: { maxScrolls: 0, maxPhysicalAttempts: 8 } } as never;
    const verified = await verifyBrowserUseProposal({ request, capability, proposal: { ...proposal, visitedUrls: [listing.url, a, b], articleUrls: [a, b], continuation: "none" }, port });
    expect(verified.plan.articlePathPrefix).toBe("/article/");
    expect(verified.articles).toHaveLength(2);
    expect(closes).toBe(1);
    const fallback = await verifyBrowserUseProposal({ request, capability, proposal: { ...proposal, visitedUrls: [listing.url, a, "https://news.example/article/unobserved"], articleUrls: [a, "https://news.example/article/unobserved"], continuation: "none" }, port });
    expect(fallback.articles.map(article => article.article?.canonicalUrl)).toEqual([a, b]);
    expect(closes).toBe(2);
    await expect(verifyBrowserUseProposal({ request, capability, proposal: { ...proposal, visitedUrls: [listing.url, "https://news.example/article/unobserved"], articleUrls: ["https://news.example/article/unobserved"], continuation: "none" }, port })).rejects.toThrow("browser_use_trusted_evidence_insufficient");
    expect(closes).toBe(3);
  });
  it("verifies links that appear only after a second bounded scroll", async () => {
    const source="https://news.example/", a="https://news.example/article/a", b="https://news.example/article/b";
    const observed=(url:string,links:string[]):PublicBrowserObservation=>({url,title:"News",pageRevision:`${url}:${links.length}`,visibleText:"",controls:[],listingLinks:links});
    const articles=new Map([a,b].map((url,index)=>[url,{...observed(url,[]),article:{canonicalUrl:url,title:"Article",body:"Verified full body",excerpt:"",publisherTimestamp:`2026-09-${20+index}T00:00:00Z`}}]));
    let scrolls=0, closes=0;
    const port={open:async()=>{},navigateAndObserve:async(url:string)=>url===source?observed(source,[]):articles.get(url)!,scrollAndObserve:async()=>observed(source,++scrolls===1?[a]:[a,b]),close:async()=>{closes++}};
    const request={source:{canonicalSourceUrl:source},limits:{maxScrolls:3,maxPhysicalAttempts:8}} as never;
    const verified=await verifyBrowserUseProposal({request,capability,proposal:{...proposal,visitedUrls:[source,a,b],articleUrls:[a,b],continuation:"none"},port});
    expect(scrolls).toBe(2);expect(verified.articles).toHaveLength(2);expect(verified.plan.continuation.kind).toBe("SCROLL");expect(closes).toBe(1);
  });
  it("continues past duplicate canonical hints using only a fresh observed listing link", async () => {
    const source="https://news.example/", a="https://news.example/article/a", duplicate="https://news.example/article/a?ref=listing", b="https://news.example/article/b";
    const listing:PublicBrowserObservation={url:source,title:"Listing",pageRevision:"listing",visibleText:"",controls:[],listingLinks:[a,duplicate,b]};
    const article=(url:string,canonicalUrl:string):PublicBrowserObservation=>({url,title:"Article",pageRevision:url,visibleText:"",controls:[],article:{canonicalUrl,title:"Article",body:"Independently observed complete body",excerpt:"",publisherTimestamp:"2026-09-24T00:00:00Z"}});
    const pages=new Map([[source,listing],[a,article(a,a)],[duplicate,article(duplicate,a)],[b,article(b,b)]]);
    const visited:string[]=[];
    const port={open:async()=>{},navigateAndObserve:async(url:string)=>{visited.push(url);return pages.get(url)!},close:async()=>{}};
    const request={source:{canonicalSourceUrl:source},limits:{maxScrolls:0,maxPhysicalAttempts:8}} as never;
    const verified=await verifyBrowserUseProposal({request,capability,proposal:{...proposal,visitedUrls:[source,a,duplicate],listingUrls:[source],articleUrls:[a,duplicate],continuation:"none"},port});
    expect(verified.articles.map(value=>value.article?.canonicalUrl)).toEqual([a,b]);
    expect(visited).toContain(b);
  });
  it("rejects unbounded or authenticated Browser Use bridge operations", () => {
    const base = { protocol: "v1", operationId: "op", capability: { bridgeExecutionId: "run", bootstrapRequestId: "run", runId: "run", tenantId: "tenant", ownerId: "owner", profileId: "source", expectedProfileVersion: 0, browserGeneration: 1, authFlowId: "flow", siteKind: "PUBLIC", authEntryPoint: "https://news.example/", sessionProbeUrl: "https://news.example/", allowedOrigins: ["https://news.example"], writeOrigins: [], issuedAt: "2026-09-25T00:00:00Z", expiresAt: "2026-09-25T00:02:00Z", operationBudget: 20 }, operation: "DISCOVER_SOURCE_WITH_BROWSER_USE", sourceUrl: "https://news.example/", modelRef: "openai/model", maxSteps: 12 };
    expect(() => assertBridgeRequestShape(base)).not.toThrow();
    expect(() => assertBridgeRequestShape({ ...base, maxSteps: 1000 })).toThrow();
    expect(() => assertBridgeRequestShape({ ...base, capability: { ...base.capability, siteKind: "X" } })).toThrow();
  });
});
