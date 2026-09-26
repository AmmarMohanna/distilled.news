import { describe, expect, it } from "vitest";
import type { PublicBrowserObservation, SourceAcquisitionRequest, SourceBrowserWorkflowPort } from "@distilled/agent-runtime";
import { AuthenticatedBrowserBridgeError } from "@distilled/agent-runtime";
import { bridgeStop, discoverBrowserUseSourcePlan, discoverPublicSourceBrowserPlan } from "./public-source-discovery";
import type { Env } from "./types";

const source = "https://publisher.example/news";
const article = (id: string): PublicBrowserObservation => ({ url: `https://publisher.example/article/${id}`, title: id, pageRevision: id, visibleText: "", controls: [], article: { canonicalUrl: `https://publisher.example/article/${id}`, title: id, body: `Body ${id}`, excerpt: id, publisherTimestamp: "2026-09-21T00:00:00Z" } });
const request: SourceAcquisitionRequest = { source: { canonicalSourceUrl: source }, window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" }, limits: { maxItems: 5, maxPages: 2, maxScrolls: 1, maxPhysicalAttempts: 5, maxExecutionMs: 20_000 } };

describe("public source discovery from trusted Container structure", () => {
  it("preserves only bounded policy evidence from a typed Container failure", () => {
    const error = new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED", { policyRule: "ORIGIN_NOT_ADMITTED", deniedHostname: "static.publisher.example", redirectHop: false, topLevelNavigation: false, admittedOriginCount: 1 });
    Object.assign(error, { operation: "NAVIGATE_PUBLIC_PAGE" });
    error.message = "unsafe provider text /private/path?token=secret";
    const outcome = bridgeStop(error);
    expect(outcome).toMatchObject({ status: "POLICY_DENIED", details: { operation: "NAVIGATE_PUBLIC_PAGE", policy: { rule: "ORIGIN_NOT_ADMITTED", deniedHostname: "static.publisher.example", redirectHop: false, topLevelNavigation: false } } });
    expect(JSON.stringify(outcome)).not.toMatch(/unsafe|private|secret/);
  });
  it("preserves a fixed Browser Use failure category without provider text", () => {
    const error = new AuthenticatedBrowserBridgeError("BRIDGE_BROWSER_FAILURE", { browserUseFailure: "MODEL_REQUEST_FAILED" });
    error.message = "Authorization: Bearer secret-provider-value";
    const outcome = bridgeStop(error);
    expect(outcome).toMatchObject({ status: "STRUCTURAL_FAILURE", details: { browserUseFailure: "MODEL_REQUEST_FAILED" } });
    expect(JSON.stringify(outcome)).not.toMatch(/Bearer|secret-provider-value/);
  });
  it("carries sanitized exception class metadata for runner failures", () => {
    const error = new AuthenticatedBrowserBridgeError("BRIDGE_BROWSER_FAILURE", { browserUseFailure: "AGENT_RUN_FAILED", failureType: "browser_use.exceptions.BrowserError", causeType: "builtins.RuntimeError" });
    const outcome = bridgeStop(error, "BROWSER_USE_DISCOVERY");
    expect(outcome.reason).toContain("browser_use.exceptions.BrowserError/builtins.RuntimeError");
    expect(outcome.details).toMatchObject({ failureType: "browser_use.exceptions.BrowserError", causeType: "builtins.RuntimeError" });
  });
  it("samples two real article observations and closes exactly once", async () => {
    const links = ["a", "b"].map((id) => ({ handle: id, kind: "link" as const, role: "link", label: id, safeAction: "follow" as const, destinationUrl: `https://publisher.example/article/${id}` }));
    const listing: PublicBrowserObservation = { url: source, title: "News", pageRevision: "listing", visibleText: "", controls: links };
    let opened = 0, closed = 0;
    const port: SourceBrowserWorkflowPort = { async open() { opened++; }, async navigateAndObserve(url) { return url === source ? listing : article(url.split("/").at(-1)!); }, async scrollAndObserve() { return { ...listing, pageRevision: "scroll" }; }, async close() { closed++; } };
    const result = await discoverPublicSourceBrowserPlan({} as Env, { request, tenantId: "tenant", ownerId: "owner", resourceId: "resource", runId: "run" }, port);
    expect(result).toMatchObject({ candidateUrl: "https://publisher.example/article/a", plan: { articlePathPrefix: "/article/" }, browserOperations: 4 });
    expect([opened, closed]).toEqual([1, 1]);
  });
  it("samples stable dated articles before live/search/navigation resources",async()=>{
    const urls=[
      "https://publisher.example/news/liveblog/2026/9/24/ongoing-live-updates-with-many-words",
      "https://publisher.example/news/2026/9/24/first-completed-report-with-details",
      "https://publisher.example/news/2026/9/24/second-completed-report-with-details"
    ];
    const listing:PublicBrowserObservation={url:source,title:"News",pageRevision:"listing",visibleText:"",controls:[],listingLinks:urls};
    const visited:string[]=[];
    const port:SourceBrowserWorkflowPort={async open(){},async navigateAndObserve(url){visited.push(url);if(url===source)return listing;if(url.includes("liveblog"))return{...article("live"),challengeState:"PASSIVE_BROWSER_CHALLENGE"};return{...article(url.includes("first-")?"first":"second"),url,article:{...article("x").article!,canonicalUrl:url}}},async close(){}};
    const result=await discoverPublicSourceBrowserPlan({} as Env,{request:{...request,limits:{...request.limits,maxPhysicalAttempts:4}},tenantId:"tenant",ownerId:"owner",resourceId:"resource",runId:"run-ranked"},port);
    expect(result?.evidence.sampledArticles.map((value)=>value.article?.canonicalUrl)).toEqual(urls.slice(1));
    expect(visited).not.toContain(urls[0]);
  });
  it("uses Browser Use hints to compile a scroll workflow only after fresh trusted observations", async () => {
    const first = "https://publisher.example/article/first", second = "https://publisher.example/article/second";
    const staticListing: PublicBrowserObservation = { url: source, title: "SPA", pageRevision: "initial", visibleText: "", controls: [] };
    const dynamicListing: PublicBrowserObservation = { ...staticListing, pageRevision: "hydrated", controls: [first, second].map(url => ({ handle: url, kind: "link" as const, role: "link", label: "Story", safeAction: "follow" as const, destinationUrl: url })) };
    let agentClosed = 0, verifierClosed = 0;
    const result = await discoverBrowserUseSourcePlan({ DISTILLED_LIVE_OPENROUTER_MODEL: "openai/model", OPENROUTER_API_KEY: "test-only" } as Env,
      { request, tenantId: "tenant", ownerId: "owner", resourceId: "resource", runId: "run" },
      { agent: { open: async () => {}, close: async () => { agentClosed++; }, discoverWithBrowserUse: async () => ({ protocol: "distilled.browser-use.discovery.v1", runId: "run_browser_use", visitedUrls: [source, first, second], listingUrls: [source], articleUrls: [first, second], continuation: "scroll", timestampHints: [], steps: 4, challengeObserved: false }) },
        verifier: { open: async () => {}, navigateAndObserve: async url => url === source ? staticListing : { ...article(url.split("/").at(-1)!), url }, scrollAndObserve: async () => dynamicListing, close: async () => { verifierClosed++; } } });
    expect(result?.plan).toMatchObject({ articlePathPrefix: "/article/", continuation: { kind: "SCROLL" } });
    expect(result?.discoveryModelCalls).toBe(4);
    expect([agentClosed, verifierClosed]).toEqual([1, 1]);
  });
});
