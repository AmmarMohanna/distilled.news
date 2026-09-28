import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedBrowserBridgeRequest, BrowserBridgeTransport, SourceAcquisitionRequest } from "@distilled/agent-runtime";
import { ContainerSourceBrowserPort } from "./container-source-browser-port";
import type { Env } from "./types";

const sourceUrl = "https://publisher.example/news";
const request: SourceAcquisitionRequest = {
  source: { canonicalSourceUrl: sourceUrl },
  window: { startTime: "2026-09-20T00:00:00Z", endTime: "2026-09-22T00:00:00Z" },
  limits: { maxItems: 5, maxPages: 2, maxScrolls: 2, maxPhysicalAttempts: 5, maxExecutionMs: 20_000 }
};
const env = { DISTILLED_BROWSER_PROVIDER: "cloudflare_container", AUTHENTICATED_BROWSER_CONTAINER: {} } as Env;
const context = { tenantId: "tenant_a", ownerId: "owner_a", resourceId: "resource_a", runId: "run_a", generation: 2 };

describe("Container public source workflow port", () => {
  it("uses only fenced read-only Container operations and closes once", async () => {
    const operations: AuthenticatedBrowserBridgeRequest[] = [];
    const transport: BrowserBridgeTransport = { async execute(operation) {
      operations.push(operation);
      if (operation.operation === "OPEN_AUTH_BROWSER") return { runId: "run_a", tenantId: "tenant_a", sessionId: "session_a", contextId: "context_a", pageId: "page_a", generation: 2, viewport: { width: 1, height: 1, deviceScaleFactor: 1 } };
      if (operation.operation === "OBSERVE_PUBLIC_PAGE") return { url: sourceUrl, title: "News", pageRevision: "revision_a", visibleText: "", controls: [] };
      if (operation.operation === "CLOSE_AUTH_BROWSER") return { closed: true };
      return { accepted: true };
    } };
    const port = new ContainerSourceBrowserPort(env, context, transport);
    await port.open({ sourceUrl, allowedOrigins: [new URL(sourceUrl).origin], request });
    await port.navigateAndObserve(sourceUrl);
    await port.close(); await port.close();
    expect(operations.map((operation) => operation.operation)).toEqual(["OPEN_AUTH_BROWSER", "NAVIGATE_PUBLIC_PAGE", "OBSERVE_PUBLIC_PAGE", "CLOSE_AUTH_BROWSER"]);
    expect(operations.every((operation) => operation.capability.siteKind === "PUBLIC" && operation.capability.writeOrigins.length === 0 && operation.capability.tenantId === context.tenantId && operation.capability.ownerId === context.ownerId && operation.capability.browserGeneration === context.generation)).toBe(true);
  });

  it("rejects another origin and never falls back to Cloudflare Browser", async () => {
    const operations: string[] = [];
    const transport: BrowserBridgeTransport = { async execute(operation) {
      operations.push(operation.operation);
      if (operation.operation === "OPEN_AUTH_BROWSER") return { runId: "run_a", tenantId: "tenant_a", sessionId: "session_a", contextId: "context_a", pageId: "page_a", generation: 2, viewport: { width: 1, height: 1, deviceScaleFactor: 1 } };
      return { closed: true };
    } };
    expect(() => new ContainerSourceBrowserPort({ ...env, DISTILLED_BROWSER_PROVIDER: "cloudflare_browser" }, context, transport)).toThrow();
    const port = new ContainerSourceBrowserPort(env, context, transport);
    await port.open({ sourceUrl, allowedOrigins: [new URL(sourceUrl).origin], request });
    await expect(port.navigateAndObserve("https://foreign.example/news")).rejects.toThrow();
    await port.close();
    expect(operations).toEqual(["OPEN_AUTH_BROWSER", "CLOSE_AUTH_BROWSER"]);
  });
  it("sends a bounded Browser Use discovery operation through the same public capability", async () => {
    const operations: AuthenticatedBrowserBridgeRequest[] = [];
    const transport: BrowserBridgeTransport = { async execute(operation) {
      operations.push(operation);
      if (operation.operation === "OPEN_AUTH_BROWSER") return { runId: "run_a", tenantId: "tenant_a", sessionId: "session_a", contextId: "context_a", pageId: "page_a", generation: 2, viewport: { width: 1, height: 1, deviceScaleFactor: 1 } };
      if (operation.operation === "DISCOVER_SOURCE_WITH_BROWSER_USE") return { protocol: "distilled.browser-use.discovery.v1", runId: "run_a", visitedUrls: [sourceUrl], listingUrls: [sourceUrl], articleUrls: [], continuation: "none", timestampHints: [], steps: 2, challengeObserved: false };
      return { closed: true };
    } };
    const port = new ContainerSourceBrowserPort(env, context, transport);
    await port.open({ sourceUrl, allowedOrigins: [new URL(sourceUrl).origin], request });
    expect((await port.discoverWithBrowserUse(sourceUrl, "openai/model", 4)).steps).toBe(2);
    await expect(port.discoverWithBrowserUse("https://other.example/", "openai/model", 4)).rejects.toThrow();
    await port.close();
    expect(operations.map(value => value.operation)).toEqual(["OPEN_AUTH_BROWSER", "DISCOVER_SOURCE_WITH_BROWSER_USE", "CLOSE_AUTH_BROWSER"]);
    expect(operations[1].capability.writeOrigins).toEqual([]);
  });
  it("issues browser authority only after cold Container readiness",async()=>{
    let clock=Date.now();const initial=clock;let issued=0;
    const now=vi.spyOn(Date,"now").mockImplementation(()=>clock);
    const binding={idFromName:(name:string)=>name,get:()=>({
      health:async()=>{clock+=45000;return{state:"READY" as const}},
      executeAuthenticatedBrowser:async(operation:AuthenticatedBrowserBridgeRequest)=>{
        if(operation.operation==="OPEN_AUTH_BROWSER"){
          issued=Date.parse(operation.capability.issuedAt);
          expect(Date.parse(operation.capability.expiresAt)-issued).toBe(request.limits.maxExecutionMs+10000);
          return{runId:"run_a",tenantId:"tenant_a",sessionId:"session_a",contextId:"context_a",pageId:"page_a",generation:2,viewport:{width:1,height:1,deviceScaleFactor:1}};
        }
        return{closed:true};
      }
    })};
    try{
      const port=new ContainerSourceBrowserPort({...env,AUTHENTICATED_BROWSER_CONTAINER:binding} as unknown as Env,context);
      await port.open({sourceUrl,allowedOrigins:[new URL(sourceUrl).origin],request});await port.close();
      expect(issued).toBe(initial+45000);
    }finally{now.mockRestore()}
  });
});
