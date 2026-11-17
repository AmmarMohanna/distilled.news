import type { SourceAcquisitionRequest, SourceAcquisitionResult } from "./temporal-acquisition";

export type AcquisitionStage = "STRUCTURED" | "HTTP" | "BROWSER_WORKFLOW" | "WEB_OPERATOR";
export type AcquisitionStageStatus = "SUCCESS" | "UNSUPPORTED" | "INSUFFICIENT" | "STRUCTURAL_FAILURE" | "TRANSIENT_FAILURE" | "AUTH_REQUIRED" | "CHALLENGE_REQUIRED" | "POLICY_DENIED" | "BUDGET_EXHAUSTED";

export interface AcquisitionStageOutcome {
  stage: AcquisitionStage;
  status: AcquisitionStageStatus;
  result?: SourceAcquisitionResult;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface ActiveWorkflowHandle {
  id: string;
  version: number;
  execute(request: SourceAcquisitionRequest): Promise<AcquisitionStageOutcome>;
}

export interface CandidateWorkflowHandle extends ActiveWorkflowHandle {
  state: "CANDIDATE" | "VALIDATED" | "ACTIVE";
}

export interface WebOperatorDiscovery {
  candidate: CandidateWorkflowHandle;
  validate(candidate: CandidateWorkflowHandle): Promise<CandidateWorkflowHandle>;
  activate(candidate: CandidateWorkflowHandle): Promise<ActiveWorkflowHandle>;
  runId?: string;
  modelCalls?: number;
  browserOperations?: number;
}

export interface SourceAcquisitionOrchestratorOptions {
  lookupActiveWorkflow?: (source: SourceAcquisitionRequest["source"]) => Promise<ActiveWorkflowHandle | undefined>;
  structured?: (request: SourceAcquisitionRequest) => Promise<AcquisitionStageOutcome>;
  http?: (request: SourceAcquisitionRequest) => Promise<AcquisitionStageOutcome>;
  browserWorkflow?: (request: SourceAcquisitionRequest, workflow?: ActiveWorkflowHandle) => Promise<AcquisitionStageOutcome>;
  webOperator?: (request: SourceAcquisitionRequest) => Promise<WebOperatorDiscovery | AcquisitionStageOutcome>;
}

export interface AcquisitionStageTrace {
  stage: AcquisitionStage;
  status: AcquisitionStageStatus;
  reason?: string;
  /** Bounded network-policy evidence; never a raw provider message or URL. */
  operation?: "OPEN_AUTH_BROWSER" | "NAVIGATE_PUBLIC_PAGE" | "OBSERVE_PUBLIC_PAGE" | "SCROLL_PUBLIC_PAGE" | "CLOSE_AUTH_BROWSER";
  policy?: { rule: string; deniedHostname?: string; redirectHop: boolean; topLevelNavigation: boolean };
  challenge?: { state: string; rule: string; visibleEvidence: boolean; structuralEvidence: boolean; actionableEvidence: boolean; surface: "TOP_LEVEL_DOCUMENT" };
}

export interface SourceAcquisitionOrchestrationResult {
  status: "SUCCESS" | "STOPPED" | "UNAVAILABLE";
  result?: SourceAcquisitionResult;
  stages: AcquisitionStageTrace[];
  activeWorkflow?: { id: string; version: number };
  candidateWorkflow?: { id: string; version: number; promoted: boolean };
  webOperatorCalls: number;
  webOperatorRunId?: string;
  discoveryModelCalls?: number;
  discoveryBrowserOperations?: number;
  stopReason?: AcquisitionStageStatus;
}

/** Generic mechanism selection. Site semantics remain in stage adapters/workflows. */
export class SourceAcquisitionOrchestrator {
  constructor(private readonly options: SourceAcquisitionOrchestratorOptions) {}

  async acquire(request: SourceAcquisitionRequest): Promise<SourceAcquisitionOrchestrationResult> {
    const stages: AcquisitionStageTrace[] = [];
    const record = (outcome: AcquisitionStageOutcome) => { stages.push({ stage: outcome.stage, status: outcome.status, reason: outcome.reason, ...(outcome.status === "POLICY_DENIED" && outcome.details?.operation ? { operation: outcome.details.operation as AcquisitionStageTrace["operation"] } : {}), ...(outcome.status === "POLICY_DENIED" && outcome.details?.policy ? { policy: outcome.details.policy as AcquisitionStageTrace["policy"] } : {}), ...((outcome.status === "CHALLENGE_REQUIRED" || outcome.status === "AUTH_REQUIRED") && outcome.details?.challenge ? { challenge: outcome.details.challenge as AcquisitionStageTrace["challenge"] } : {}) }); return outcome; };
    const terminal = (outcome: AcquisitionStageOutcome): SourceAcquisitionOrchestrationResult => ({ status: "STOPPED", stages, stopReason: outcome.status, webOperatorCalls: 0 });

    if (this.options.structured) {
      const outcome = record(await this.options.structured(request));
      if (outcome.status === "SUCCESS") return { status: "SUCCESS", result: outcome.result, stages, webOperatorCalls: 0 };
      if (!this.mayEscalate(outcome.status)) return terminal(outcome);
    }
    if (this.options.http) {
      const outcome = record(await this.options.http(request));
      if (outcome.status === "SUCCESS") return { status: "SUCCESS", result: outcome.result, stages, webOperatorCalls: 0 };
      if (!this.mayEscalate(outcome.status)) return terminal(outcome);
    }

    const active = await this.options.lookupActiveWorkflow?.(request.source);
    if (active && this.options.browserWorkflow) {
      const outcome = record(await this.options.browserWorkflow(request, active));
      if (outcome.status === "SUCCESS") return { status: "SUCCESS", result: outcome.result, stages, activeWorkflow: { id: active.id, version: active.version }, webOperatorCalls: 0 };
      if (outcome.status === "POLICY_DENIED" || outcome.status === "AUTH_REQUIRED" || outcome.status === "CHALLENGE_REQUIRED" || outcome.status === "BUDGET_EXHAUSTED" || outcome.status === "TRANSIENT_FAILURE") return terminal(outcome);
      if (outcome.status !== "STRUCTURAL_FAILURE" && outcome.status !== "INSUFFICIENT" && outcome.status !== "UNSUPPORTED") return terminal(outcome);
      if (!this.options.webOperator) return terminal(outcome);
    }

    if (!this.options.webOperator) return { status: "UNAVAILABLE", stages, webOperatorCalls: 0, stopReason: "UNSUPPORTED" };
    const discovery = await this.options.webOperator(request);
    if ("stage" in discovery) {
      record(discovery);
      if(discovery.status==='SUCCESS' && discovery.result) return {status:'SUCCESS',result:discovery.result,stages,webOperatorCalls:1};
      return { status: "STOPPED", stages, webOperatorCalls: 1, stopReason: discovery.status };
    }
    const candidateTrace: AcquisitionStageTrace = { stage: "WEB_OPERATOR", status: "SUCCESS", reason: "candidate_discovered" };
    stages.push(candidateTrace);
    let activeWorkflow: ActiveWorkflowHandle;
    try {
      const validated = await discovery.validate(discovery.candidate);
      activeWorkflow = await discovery.activate(validated);
    } catch {
      record({ stage: "WEB_OPERATOR", status: "STRUCTURAL_FAILURE", reason: "candidate_validation_or_promotion_failed" });
      return { status: "STOPPED", stages, candidateWorkflow: { id: discovery.candidate.id, version: discovery.candidate.version, promoted: false }, webOperatorCalls: 1, stopReason: "STRUCTURAL_FAILURE", webOperatorRunId: discovery.runId, discoveryModelCalls: discovery.modelCalls, discoveryBrowserOperations: discovery.browserOperations };
    }
    const acquired = record(await activeWorkflow.execute(request));
    const metrics = { webOperatorRunId: discovery.runId, discoveryModelCalls: discovery.modelCalls, discoveryBrowserOperations: discovery.browserOperations };
    if (acquired.status !== "SUCCESS") return { status: "STOPPED", stages, activeWorkflow: { id: activeWorkflow.id, version: activeWorkflow.version }, candidateWorkflow: { id: discovery.candidate.id, version: discovery.candidate.version, promoted: true }, webOperatorCalls: 1, stopReason: acquired.status, ...metrics };
    return { status: "SUCCESS", result: acquired.result, stages, activeWorkflow: { id: activeWorkflow.id, version: activeWorkflow.version }, candidateWorkflow: { id: discovery.candidate.id, version: discovery.candidate.version, promoted: true }, webOperatorCalls: 1, ...metrics };
  }

  private mayEscalate(status: AcquisitionStageStatus) { return status === "UNSUPPORTED" || status === "INSUFFICIENT" || status === "STRUCTURAL_FAILURE"; }
}
