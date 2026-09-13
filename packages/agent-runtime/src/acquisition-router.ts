import type { AgentRunBudgetLimits, CandidateIdentity } from "./contracts";
import type { StructuralFailureClass } from "./workflow";

export type AcquisitionMethod =
  | "structured_api_feed"
  | "http_deterministic_extraction"
  | "deterministic_browser_workflow"
  | "web_operator";

export interface AcquisitionFailure {
  method: AcquisitionMethod;
  failureClass: StructuralFailureClass;
  occurredAt: string;
}

export interface AcquisitionRouteDecision {
  method: AcquisitionMethod;
  reason: string;
  escalatedFrom?: AcquisitionMethod;
  backoffUntil?: string;
}

export interface AcquisitionRouteInput {
  candidate: CandidateIdentity;
  failures: AcquisitionFailure[];
  budget: AgentRunBudgetLimits;
  policyAllowsWebOperator: boolean;
  now?: Date;
}

export class AcquisitionRouter {
  decide(input: AcquisitionRouteInput): AcquisitionRouteDecision {
    const now = input.now ?? new Date();
    if (input.budget.browserActions <= 0 || input.budget.modelCalls <= 0) {
      return { method: "structured_api_feed", reason: "browser_or_model_budget_unavailable" };
    }
    const latest = input.failures.at(-1);
    if (!latest) return { method: "structured_api_feed", reason: "no_prior_failure" };
    if (latest.failureClass === "transient_browser_network_failure") {
      return {
        method: latest.method,
        reason: "transient_failure_backoff",
        backoffUntil: new Date(now.getTime() + 5 * 60 * 1000).toISOString()
      };
    }
    if (latest.failureClass === "authentication_or_challenge" || latest.failureClass === "policy_restriction") {
      return { method: latest.method, reason: latest.failureClass };
    }
    const structuralEvidence = input.failures.filter((failure) =>
      failure.method === latest.method &&
      ["structural_site_change", "extraction_mismatch", "watermark_ambiguity", "source_unavailable"].includes(failure.failureClass)
    );
    if (structuralEvidence.length < 2) {
      return { method: latest.method, reason: "waiting_for_bounded_structural_evidence" };
    }
    if (latest.method === "structured_api_feed") {
      return { method: "http_deterministic_extraction", escalatedFrom: latest.method, reason: "structured_feed_confirmed_unavailable" };
    }
    if (latest.method === "http_deterministic_extraction") {
      return { method: "deterministic_browser_workflow", escalatedFrom: latest.method, reason: "http_extraction_confirmed_structural_failure" };
    }
    if (latest.method === "deterministic_browser_workflow" && input.policyAllowsWebOperator) {
      return { method: "web_operator", escalatedFrom: latest.method, reason: "workflow_confirmed_structural_failure" };
    }
    return { method: latest.method, reason: "escalation_not_authorized" };
  }
}
