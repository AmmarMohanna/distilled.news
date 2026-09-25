import {
  AuthenticatedBrowserBridgeError,
  BrowserPreDispatchError,
  type AuthenticatedBrowserExecutionCapability,
  type BrowserAllocation,
  type BrowserBridgeTransport,
  type BrowserExecutorPort,
  type BrowserObservationData,
  type BrowserScope,
  type InteractionCapability,
  type PublicBrowserObservation,
  type ScreenshotData,
  type SemanticControl,
  type StructuredBrowserUsePort,
  type VisualComputerUsePort
} from "@distilled/agent-runtime";
import { CloudflareContainerBrowserBridgeTransport } from "./cloudflare-container-browser-transport";
import type { Env } from "./types";

type Session = { allocation: BrowserAllocation; capability: AuthenticatedBrowserExecutionCapability; current?: PublicBrowserObservation; closed: boolean };

/** Restricted Web Operator browser port: Container CDP observations and read-only navigation only. */
export class ContainerPublicWebOperatorBrowser implements BrowserExecutorPort, StructuredBrowserUsePort, VisualComputerUsePort {
  private readonly sessions = new Map<string, Session>();
  private readonly transport: BrowserBridgeTransport;

  constructor(
    env: Pick<Env, "DISTILLED_BROWSER_PROVIDER" | "AUTHENTICATED_BROWSER_CONTAINER">,
    private readonly ownerId: string,
    private readonly resourceId: string,
    private readonly entryUrl: string,
    private readonly operationBudget: number,
    transport?: BrowserBridgeTransport
  ) {
    if ((env.DISTILLED_BROWSER_PROVIDER ?? "").trim().toLowerCase() !== "cloudflare_container" || !env.AUTHENTICATED_BROWSER_CONTAINER) throw new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE");
    this.transport = transport ?? new CloudflareContainerBrowserBridgeTransport(env.AUTHENTICATED_BROWSER_CONTAINER);
  }

  async allocate(input: { runId: string; tenantId: string; generation: number; allowedOrigins: string[] }): Promise<BrowserAllocation> {
    const entry = new URL(this.entryUrl);
    if (entry.protocol !== "https:" || !input.allowedOrigins.includes(entry.origin)) throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    const now = Date.now();
    const capability: AuthenticatedBrowserExecutionCapability = {
      bridgeExecutionId: input.runId,
      bootstrapRequestId: input.runId,
      runId: input.runId,
      tenantId: input.tenantId,
      ownerId: this.ownerId,
      profileId: this.resourceId,
      expectedProfileVersion: 0,
      browserGeneration: input.generation,
      authFlowId: `public_source_${input.runId}`,
      siteKind: "PUBLIC",
      authEntryPoint: entry.href,
      sessionProbeUrl: entry.href,
      allowedOrigins: input.allowedOrigins,
      writeOrigins: [],
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 120_000).toISOString(),
      operationBudget: Math.min(64, Math.max(4, this.operationBudget))
    };
    const opened = await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability, operation: "OPEN_AUTH_BROWSER" });
    if (!opened || typeof opened !== "object" || !("sessionId" in opened) || opened.runId !== input.runId || opened.tenantId !== input.tenantId || opened.generation !== input.generation) {
      await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability, operation: "CLOSE_AUTH_BROWSER" }).catch(() => undefined);
      throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    }
    const allocation = opened as BrowserAllocation;
    this.sessions.set(allocation.sessionId, { allocation, capability, closed: false });
    return allocation;
  }

  async navigate(scope: BrowserScope, url: string): Promise<BrowserObservationData> {
    const session = this.require(scope);
    if (!session.capability.allowedOrigins.includes(new URL(url).origin)) throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability: session.capability, operation: "NAVIGATE_PUBLIC_PAGE", url });
    return this.observe(session);
  }
  async inspectDom(scope: BrowserScope) { return this.observe(this.require(scope)); }
  async inspectAccessibilityTree(scope: BrowserScope) { return this.observe(this.require(scope)); }
  async extract(scope: BrowserScope) { return this.observe(this.require(scope)); }
  async queryPageState(scope: BrowserScope) { return this.observe(this.require(scope)); }
  async followLink(): Promise<BrowserObservationData> { throw new BrowserPreDispatchError("public Container follow-link requires a fenced observed target"); }
  async scroll(scope: BrowserScope, deltaY: number): Promise<BrowserObservationData> {
    const session = this.require(scope);
    if (!Number.isInteger(deltaY) || deltaY < 1 || deltaY > 2000) throw new BrowserPreDispatchError("public Container scroll budget denied");
    const observed = await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability: session.capability, operation: "SCROLL_PUBLIC_PAGE", deltaY });
    return this.acceptObserved(session, observed);
  }
  async screenshot(): Promise<ScreenshotData> { throw new BrowserPreDispatchError("public Container screenshot operation is unavailable"); }
  async movePointer(): Promise<BrowserObservationData> { throw new BrowserPreDispatchError("public Container pointer operation is unavailable"); }
  async click(): Promise<BrowserObservationData> { throw new BrowserPreDispatchError("public Container click operation is unavailable"); }
  async issueVisualCapability(): Promise<InteractionCapability | null> { return null; }

  async bindObservationCapabilities(scope: BrowserScope, input: { pageRevision: string; controls: SemanticControl[] }): Promise<SemanticControl[]> {
    const session = this.require(scope);
    if (session.current?.pageRevision !== input.pageRevision) throw new AuthenticatedBrowserBridgeError("BRIDGE_OBSERVATION_STALE");
    return input.controls.map((control) => ({ ...control, safeAction: control.safeAction === "follow" ? "unknown" : control.safeAction, interactionCapability: undefined }));
  }
  async health(scope: BrowserScope): Promise<"healthy" | "closed"> { return this.sessions.get(scope.sessionId)?.closed ? "closed" : "healthy"; }
  async close(scope: BrowserScope): Promise<void> {
    const session = this.sessions.get(scope.sessionId);
    if (!session || session.closed) return;
    session.closed = true;
    this.sessions.delete(scope.sessionId);
    await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability: session.capability, operation: "CLOSE_AUTH_BROWSER" });
  }
  async crashForTest(): Promise<void> { throw new BrowserPreDispatchError("test crash is unavailable in production Container port"); }

  private require(scope: BrowserScope): Session {
    const session = this.sessions.get(scope.sessionId);
    if (!session || session.closed || session.allocation.runId !== scope.runId || session.allocation.tenantId !== scope.tenantId || session.allocation.generation !== scope.generation) throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    return session;
  }
  private async observe(session: Session): Promise<BrowserObservationData> {
    const observed = await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability: session.capability, operation: "OBSERVE_PUBLIC_PAGE" });
    return this.acceptObserved(session, observed);
  }
  private acceptObserved(session: Session, observed: unknown): BrowserObservationData {
    if (!observed || typeof observed !== "object" || !("pageRevision" in observed)) throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    const value = observed as PublicBrowserObservation;
    if (!session.capability.allowedOrigins.includes(new URL(value.url).origin)) throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    session.current = value;
    const representation = { visibleText: value.visibleText, controls: value.controls, listingLinks: value.listingLinks, challengeDiagnostics: value.challengeDiagnostics, article: value.article ? { title: value.article.title, canonicalUrl: value.article.canonicalUrl, publisherTimestamp: value.article.publisherTimestamp } : undefined };
    return {
      url: value.url, finalUrl: value.url, title: value.title, pageId: session.allocation.pageId, pageRevision: value.pageRevision,
      contentType: "application/json", raw: new TextEncoder().encode(JSON.stringify(representation)), representation,
      observationSource: "CDP_DOM_SNAPSHOT", protocolSnapshotVersion: value.trustedObservationSchemaVersion ?? "trusted-observation-v1",
      bridgeProtocolVersion: value.bridgeProtocolVersion, trustedObservationSchemaVersion: value.trustedObservationSchemaVersion,
      controls: value.controls, listingLinks: value.listingLinks, challengeState: value.challengeState ?? "NO_CHALLENGE", challengeDiagnostics: value.challengeDiagnostics, watermarkObserved: value.watermarkObserved ?? false, article: value.article,
      documentCountCategory: value.documentCountCategory, iframeCountCategory: value.iframeCountCategory,
      domNodeCountCategory: value.domNodeCountCategory, accessibilityNodeCountCategory: value.accessibilityNodeCountCategory
    };
  }
}
