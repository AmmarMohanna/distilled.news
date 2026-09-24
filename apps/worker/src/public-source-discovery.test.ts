import { describe, expect, it } from "vitest";
import type { PublicBrowserObservation, SourceAcquisitionRequest, SourceBrowserWorkflowPort } from "@distilled/agent-runtime";
import { AuthenticatedBrowserBridgeError } from "@distilled/agent-runtime";
import { bridgeStop, discoverPublicSourceBrowserPlan } from "./public-source-discovery";
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
  it("samples two real article observations and closes exactly once", async () => {
    const links = ["a", "b"].map((id) => ({ handle: id, kind: "link" as const, role: "link", label: id, safeAction: "follow" as const, destinationUrl: `https://publisher.example/article/${id}` }));
    const listing: PublicBrowserObservation = { url: source, title: "News", pageRevision: "listing", visibleText: "", controls: links };
    let opened = 0, closed = 0;
    const port: SourceBrowserWorkflowPort = { async open() { opened++; }, async navigateAndObserve(url) { return url === source ? listing : article(url.split("/").at(-1)!); }, async scrollAndObserve() { return { ...listing, pageRevision: "scroll" }; }, async close() { closed++; } };
    const result = await discoverPublicSourceBrowserPlan({} as Env, { request, tenantId: "tenant", ownerId: "owner", resourceId: "resource", runId: "run" }, port);
    expect(result).toMatchObject({ candidateUrl: "https://publisher.example/article/a", plan: { articlePathPrefix: "/article/" }, browserOperations: 4 });
    expect([opened, closed]).toEqual([1, 1]);
  });
});
