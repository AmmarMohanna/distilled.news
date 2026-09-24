import {
  AuthenticatedBrowserBridgeError,
  type AuthenticatedBrowserExecutionCapability,
  type BrowserBridgeTransport,
  type PublicBrowserObservation,
  type SourceAcquisitionRequest,
  type SourceBrowserWorkflowPort
} from "@distilled/agent-runtime";
import { CloudflareContainerBrowserBridgeTransport } from "./cloudflare-container-browser-transport";
import type { Env } from "./types";

/** Bounded PUBLIC/READ_ONLY bridge port. It cannot express credential or mutation operations. */
export class ContainerSourceBrowserPort implements SourceBrowserWorkflowPort {
  private capability?: AuthenticatedBrowserExecutionCapability;
  private opened = false;
  private closed = false;
  private transport: BrowserBridgeTransport;

  constructor(
    env: Pick<Env, "DISTILLED_BROWSER_PROVIDER" | "AUTHENTICATED_BROWSER_CONTAINER">,
    private readonly context: { tenantId: string; ownerId: string; resourceId: string; runId: string; generation: number },
    transport?: BrowserBridgeTransport
  ) {
    if ((env.DISTILLED_BROWSER_PROVIDER ?? "").trim().toLowerCase() !== "cloudflare_container" || !env.AUTHENTICATED_BROWSER_CONTAINER) {
      throw new AuthenticatedBrowserBridgeError("BRIDGE_UNAVAILABLE");
    }
    this.transport = transport ?? new CloudflareContainerBrowserBridgeTransport(env.AUTHENTICATED_BROWSER_CONTAINER);
  }

  async open(input: { sourceUrl: string; allowedOrigins: string[]; request: SourceAcquisitionRequest }): Promise<void> {
    if (this.capability) throw new AuthenticatedBrowserBridgeError("BRIDGE_REPLAY_REJECTED");
    const source = new URL(input.sourceUrl);
    if (source.protocol !== "https:" || !input.allowedOrigins.includes(source.origin)) throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    const now = Date.now();
    const operationBudget = Math.min(64, Math.max(4, input.request.limits.maxPhysicalAttempts * 2 + 2));
    const capability: AuthenticatedBrowserExecutionCapability = {
      bridgeExecutionId: this.context.runId,
      bootstrapRequestId: this.context.runId,
      runId: this.context.runId,
      tenantId: this.context.tenantId,
      ownerId: this.context.ownerId,
      profileId: this.context.resourceId,
      expectedProfileVersion: 0,
      browserGeneration: this.context.generation,
      authFlowId: `public_source_${this.context.runId}`,
      siteKind: "PUBLIC",
      authEntryPoint: source.href,
      sessionProbeUrl: source.href,
      allowedOrigins: input.allowedOrigins,
      writeOrigins: [],
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + Math.min(120_000, input.request.limits.maxExecutionMs + 10_000)).toISOString(),
      operationBudget
    };
    this.capability = capability;
    const opened = await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability, operation: "OPEN_AUTH_BROWSER" });
    if (!opened || typeof opened !== "object" || !("sessionId" in opened) || opened.runId !== this.context.runId || opened.tenantId !== this.context.tenantId || opened.generation !== this.context.generation) {
      throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    }
    this.opened = true;
  }

  async navigateAndObserve(url: string): Promise<PublicBrowserObservation> {
    const capability = this.capability;
    if (!capability || !this.opened || this.closed) throw new AuthenticatedBrowserBridgeError("BRIDGE_EXECUTION_EXPIRED");
    if (!capability.allowedOrigins.includes(new URL(url).origin)) throw new AuthenticatedBrowserBridgeError("BRIDGE_NETWORK_POLICY_DENIED");
    await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability, operation: "NAVIGATE_PUBLIC_PAGE", url });
    const observation = await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability, operation: "OBSERVE_PUBLIC_PAGE" });
    if (!observation || typeof observation !== "object" || !("pageRevision" in observation)) throw new AuthenticatedBrowserBridgeError("BRIDGE_FENCE_MISMATCH");
    return observation as PublicBrowserObservation;
  }

  async close(): Promise<void> {
    if (this.closed || !this.capability) return;
    this.closed = true;
    await this.transport.execute({ protocol: "v1", operationId: crypto.randomUUID(), capability: this.capability, operation: "CLOSE_AUTH_BROWSER" });
  }
}
