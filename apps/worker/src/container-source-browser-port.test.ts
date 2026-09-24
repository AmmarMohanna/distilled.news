import { describe, expect, it } from "vitest";
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
});
