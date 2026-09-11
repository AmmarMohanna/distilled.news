import type { AgentPageState, AgentPolicyDecision, InteractionCapability, ModelPolicy, PlannedAction, ToolName } from "./contracts";
import { makeId } from "./contracts";

export interface RunPolicySnapshot {
  id: string;
  allowedOrigins: string[];
  allowLoopback: boolean;
  allowedTools: ToolName[];
  visualReadPurposes: string[];
  modelPolicy: ModelPolicy;
}

export interface PolicyEvaluationInput {
  runId: string;
  toolCallId: string;
  action: PlannedAction;
  pageState?: AgentPageState;
  tenantId: string;
  generation: number;
  now?: string;
}

export class PolicyEngine {
  private readonly origins: Set<string>;
  private readonly allowedTools: Set<ToolName>;

  constructor(readonly snapshot: RunPolicySnapshot) {
    this.origins = new Set(snapshot.allowedOrigins);
    this.allowedTools = new Set(snapshot.allowedTools);
  }

  evaluate(input: PolicyEvaluationInput): AgentPolicyDecision {
    const result = this.decide(input);
    return {
      id: makeId("policy", input.runId, input.toolCallId),
      runId: input.runId,
      toolCallId: input.toolCallId,
      allowed: result.allowed,
      reasonCode: result.reason,
      policySnapshotId: this.snapshot.id,
      evaluatedAt: input.now ?? new Date().toISOString()
      ,generation:input.generation
    };
  }

  visibleCapabilities(): ToolName[] {
    return [...this.allowedTools];
  }

  private decide(input: PolicyEvaluationInput): { allowed: boolean; reason: string } {
    const { action, pageState } = input;
    if (!this.allowedTools.has(action.tool)) return { allowed: false, reason: "tool_not_in_capability_snapshot" };
    if (action.tool === "fixture.publish@1") return { allowed: false, reason: "external_mutation_forbidden" };

    if (action.tool === "browser.navigate@1") {
      const value = action.arguments as { url?: unknown };
      if (typeof value.url !== "string") return { allowed: false, reason: "invalid_navigation_target" };
      let url: URL;
      try {
        url = new URL(value.url);
      } catch {
        return { allowed: false, reason: "invalid_navigation_target" };
      }
      if (!isApprovedHttpUrl(url)) return { allowed: false, reason: "navigation_scheme_not_allowed" };
      if (!this.origins.has(url.origin)) return { allowed: false, reason: "navigation_origin_not_allowed" };
      if (isLoopback(url.hostname) && !this.snapshot.allowLoopback) {
        return { allowed: false, reason: "private_or_loopback_network_denied" };
      }
    }

    if (action.tool === "browser.follow_link@1") {
      const value = action.arguments as { handle?: unknown; capability?: unknown };
      const control = pageState?.relevantControls.find((candidate) => candidate.handle === value.handle);
      if (!control) return { allowed: false, reason: "stale_or_unknown_semantic_handle" };
      if (control.safeAction !== "follow") return { allowed: false, reason: "semantic_target_not_safe_read" };
      if (!control.destinationUrl || !isAllowedDestination(control.destinationUrl, this.origins)) {
        return { allowed: false, reason: "semantic_destination_not_allowed" };
      }
      if (typeof value.capability !== "string" || value.capability !== control.interactionCapability) {
        return { allowed: false, reason: "runtime_interaction_capability_required" };
      }
    }

    if (action.tool === "computer.move_pointer@1" || action.tool === "computer.click@1") {
      const value = action.arguments as { capability?: unknown; screenshotObservationId?: unknown; screenshotHash?: unknown };
      if (typeof value.screenshotObservationId !== "string" || value.screenshotObservationId.length === 0) {
        return { allowed: false, reason: "screenshot_binding_required" };
      }
      if (typeof value.screenshotHash !== "string" || value.screenshotHash.length === 0) {
        return { allowed:false,reason:"screenshot_hash_binding_required" };
      }
      if (!isCapability(value.capability) || value.capability.tenantId !== input.tenantId || value.capability.runId !== input.runId ||
        value.capability.browserGeneration !== input.generation || value.capability.observationId !== value.screenshotObservationId ||
        value.capability.observationHash !== value.screenshotHash) return { allowed:false,reason:"runtime_interaction_capability_required" };
      if (action.tool === "computer.click@1" && value.capability.actionClass !== "visual_read_link") {
        return { allowed:false,reason:"visual_target_not_safe_read" };
      }
    }

    return { allowed: true, reason: "allowed_by_run_policy" };
  }
}

function isCapability(value: unknown): value is InteractionCapability {
  return Boolean(value) && typeof value === "object" && typeof (value as InteractionCapability).token === "string";
}

function isApprovedHttpUrl(url: URL) { return url.protocol === "http:" || url.protocol === "https:"; }

function isAllowedDestination(value: string, origins: Set<string>) {
  try { const url = new URL(value); return isApprovedHttpUrl(url) && origins.has(url.origin); } catch { return false; }
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
}
