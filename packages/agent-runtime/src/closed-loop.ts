import type { AcquiredContent, AgentRun, AgentRunBudgetLimits, CandidateIdentity, ModelCapability, ModelRoutingConfig } from "./contracts";
import { makeId } from "./contracts";
import type { RuntimeStore } from "./persistence";
import type { ArtifactStore } from "./observations";
import type { BrowserExecutorPort, StructuredBrowserUsePort, VisualComputerUsePort } from "./browser";
import type { ModelGateway } from "./model";
import type { RunPolicySnapshot } from "./policy";
import { PolicyEngine } from "./policy";
import { DEFAULT_SLICE_BUDGET } from "./budget";
import { WebOperatorAcquisitionStrategy } from "./admission";
import { WebOperatorCoordinator, type ProcessResult } from "./runtime";
import {
  AcquisitionRouter,
  acquisitionFailureEvidence,
  type AcquisitionFailure,
  type AcquisitionFailureRepository,
  type AcquisitionMethod,
  type AcquisitionRouteDecision
} from "./acquisition-router";
import {
  DeterministicWorkflowExecutor,
  WorkflowCandidateCompiler,
  WorkflowCaptureService,
  WorkflowLifecycleCoordinator,
  WorkflowValidator,
  type StructuralFailureClass,
  type WorkflowCandidate,
  type WorkflowExecutionResult,
  type WorkflowFailureEvidence,
  type WorkflowRepository
} from "./workflow";

export interface ClosedLoopAcquisitionRequest {
  tenantId: string;
  resourceId: string;
  idempotencyKey: string;
  objective: string;
  candidate: CandidateIdentity;
  policy: RunPolicySnapshot;
  modelRouting: ModelRoutingConfig;
  modelCapabilities: ModelCapability[];
  budgetLimits?: AgentRunBudgetLimits;
  priorFailures?: AcquisitionFailure[];
  enabled: boolean;
}

type DeterministicAcquisitionMethod = Extract<AcquisitionMethod, "structured_api_feed" | "http_deterministic_extraction">;

export interface DeterministicAcquisitionPort {
  readonly method: DeterministicAcquisitionMethod;
  acquire(request: ClosedLoopAcquisitionRequest, now: Date): Promise<DeterministicAcquisitionResult>;
}

export type DeterministicAcquisitionResult =
  | {
      state: "completed";
      acquiredContent: AcquiredContent;
    }
  | {
      state: "failed";
      failureClass: StructuralFailureClass;
      transient: boolean;
      details?: Record<string, unknown>;
    };

export type ClosedLoopAcquisitionOutcome =
  | {
      state: "acquired_by_deterministic_route";
      routeDecision: AcquisitionRouteDecision;
      acquiredContent: AcquiredContent;
      modelCalls: 0;
    }
  | {
      state: "waiting_for_deterministic_route_evidence";
      routeDecision: AcquisitionRouteDecision;
      failures: AcquisitionFailure[];
      modelCalls: 0;
    }
  | {
      state: "acquired_by_workflow";
      workflow: WorkflowCandidate;
      acquiredContent: AcquiredContent;
      modelCalls: 0;
    }
  | {
      state: "acquired_by_agent";
      run: AgentRun;
      process: ProcessResult;
      workflow: WorkflowCandidate;
      acquiredContent: AcquiredContent;
      modelCalls: number;
    }
  | {
      state: "waiting_for_repair_evidence";
      workflow: WorkflowCandidate;
      failureEvidence: WorkflowFailureEvidence[];
      replay: WorkflowExecutionResult;
      routeDecision: AcquisitionRouteDecision;
      modelCalls: 0;
    };

export interface FinalizedWorkflowRun {
  run: AgentRun;
  workflow: WorkflowCandidate;
  acquiredContent: AcquiredContent;
}

export class ClosedLoopWebOperatorLifecycle {
  constructor(private readonly options: {
    runtimeStore: RuntimeStore;
    workflowStore: WorkflowRepository;
    artifacts: ArtifactStore;
    browserExecutor: BrowserExecutorPort;
    structured: StructuredBrowserUsePort;
    visual: VisualComputerUsePort;
    modelGateway: ModelGateway;
    softwareVersion: string;
    toolSchemaVersion: string;
    deterministicAcquisition?: Partial<Record<DeterministicAcquisitionMethod, DeterministicAcquisitionPort>>;
    acquisitionFailures?: AcquisitionFailureRepository;
    minimumStructuralEvidence?: number;
    workerIdFactory?: () => string;
    leaseTtlMs?: number;
  }) {}

  async acquire(request: ClosedLoopAcquisitionRequest, now = new Date()): Promise<ClosedLoopAcquisitionOutcome> {
    const active = await this.options.workflowStore.getActiveWorkflow(request.resourceId);
    if (!active) return this.acquireWithoutActiveWorkflow(request, now);

    if (normalizeUrl(active.candidate.canonicalUrl) !== normalizeUrl(request.candidate.canonicalUrl)) {
      const replay: WorkflowExecutionResult = {
        workflowId: active.id,
        state: "failed",
        failureClass: "structural_site_change",
        modelCalls: 0
      };
      return this.handleReplayFailure(active, replay, request, now);
    }

    const replay = await this.replayWorkflow(active, request, now);
    if (replay.state === "completed" && replay.acquiredContent) {
      return {
        state: "acquired_by_workflow",
        workflow: active,
        acquiredContent: replay.acquiredContent,
        modelCalls: 0
      };
    }

    return this.handleReplayFailure(active, replay, request, now);
  }

  private async acquireWithoutActiveWorkflow(
    request: ClosedLoopAcquisitionRequest,
    now: Date
  ): Promise<ClosedLoopAcquisitionOutcome> {
    const executors = this.options.deterministicAcquisition;
    if (!executors || Object.keys(executors).length === 0) return this.runAgentAndPromote(request, "discovery", now);

    const failures = await this.acquisitionFailures(request);
    const routeDecision = new AcquisitionRouter().decide({
      candidate: request.candidate,
      failures,
      budget: request.budgetLimits ?? DEFAULT_SLICE_BUDGET,
      policyAllowsWebOperator: request.enabled,
      now
    });

    if (routeDecision.method === "web_operator") return this.runAgentAndPromote(request, "discovery", now);
    if (routeDecision.method === "deterministic_browser_workflow") return this.runAgentAndPromote(request, "discovery", now);

    const executor = executors[routeDecision.method];
    if (!executor) {
      const updatedFailures = await this.recordAcquisitionFailure(request, routeDecision.method, {
        state: "failed",
        failureClass: "source_unavailable",
        transient: false,
        details: { reason: "deterministic acquisition executor unavailable" }
      }, now, failures);
      const nextRouteDecision = new AcquisitionRouter().decide({
        candidate: request.candidate,
        failures: updatedFailures,
        budget: request.budgetLimits ?? DEFAULT_SLICE_BUDGET,
        policyAllowsWebOperator: request.enabled,
        now
      });
      if (nextRouteDecision.method === "web_operator" || nextRouteDecision.method === "deterministic_browser_workflow") {
        return this.runAgentAndPromote(request, "discovery", now);
      }
      return {
        state: "waiting_for_deterministic_route_evidence",
        routeDecision: nextRouteDecision,
        failures: updatedFailures,
        modelCalls: 0
      };
    }

    const result = await executor.acquire(request, now);
    if (result.state === "completed") {
      return {
        state: "acquired_by_deterministic_route",
        routeDecision,
        acquiredContent: result.acquiredContent,
        modelCalls: 0
      };
    }

    const updatedFailures = await this.recordAcquisitionFailure(request, routeDecision.method, result, now, failures);
    const nextRouteDecision = new AcquisitionRouter().decide({
      candidate: request.candidate,
      failures: updatedFailures,
      budget: request.budgetLimits ?? DEFAULT_SLICE_BUDGET,
      policyAllowsWebOperator: request.enabled,
      now
    });
    if (nextRouteDecision.method === "web_operator") return this.runAgentAndPromote(request, "discovery", now);

    return {
      state: "waiting_for_deterministic_route_evidence",
      routeDecision: nextRouteDecision,
      failures: updatedFailures,
      modelCalls: 0
    };
  }

  private async acquisitionFailures(request: ClosedLoopAcquisitionRequest): Promise<AcquisitionFailure[]> {
    const stored = this.options.acquisitionFailures
      ? await this.options.acquisitionFailures.listAcquisitionFailures({
          tenantId: request.tenantId,
          resourceId: request.resourceId,
          candidateId: request.candidate.candidateId
        })
      : [];
    return [...stored, ...(request.priorFailures ?? [])]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private async recordAcquisitionFailure(
    request: ClosedLoopAcquisitionRequest,
    method: DeterministicAcquisitionMethod,
    result: Extract<DeterministicAcquisitionResult, { state: "failed" }>,
    now: Date,
    priorFailures: AcquisitionFailure[]
  ): Promise<AcquisitionFailure[]> {
    const evidence = acquisitionFailureEvidence({
      tenantId: request.tenantId,
      resourceId: request.resourceId,
      candidateId: request.candidate.candidateId,
      method,
      failureClass: result.failureClass,
      transient: result.transient,
      details: result.details,
      occurredAt: now.toISOString()
    });
    await this.options.acquisitionFailures?.saveAcquisitionFailure(evidence);
    return this.options.acquisitionFailures
      ? this.acquisitionFailures(request)
      : [...priorFailures, evidence].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private async handleReplayFailure(
    active: WorkflowCandidate,
    replay: WorkflowExecutionResult,
    request: ClosedLoopAcquisitionRequest,
    now: Date
  ): Promise<ClosedLoopAcquisitionOutcome> {
    const evidence = await this.recordFailure(active, replay, now);
    const routeDecision = new AcquisitionRouter().decide({
      candidate: request.candidate,
      failures: evidence.map((entry) => ({
        method: "deterministic_browser_workflow",
        failureClass: entry.failureClass,
        occurredAt: entry.observedAt
      })),
      budget: request.budgetLimits ?? DEFAULT_SLICE_BUDGET,
      policyAllowsWebOperator: request.enabled,
      now
    });
    if (routeDecision.method !== "web_operator") {
      return {
        state: "waiting_for_repair_evidence",
        workflow: active,
        failureEvidence: evidence,
        replay,
        routeDecision,
        modelCalls: 0
      };
    }
    return this.runAgentAndPromote({
      ...request,
      idempotencyKey: `${request.idempotencyKey}:repair:${active.version + 1}`,
      objective: `${request.objective}\n\nRepair the active workflow ${active.id}. Previous deterministic replay failed with ${routeDecision.reason}. Reason freely from current observations; do not mechanically mutate selectors.`
    }, "repair", now);
  }

  private async runAgentAndPromote(
    request: ClosedLoopAcquisitionRequest,
    purpose: "discovery" | "repair",
    now: Date
  ): Promise<Extract<ClosedLoopAcquisitionOutcome, { state: "acquired_by_agent" }>> {
    const strategy = new WebOperatorAcquisitionStrategy(this.options.runtimeStore);
    const admitted = await strategy.admitKnownCandidate(request, now);
    const coordinator = new WebOperatorCoordinator({
      store: this.options.runtimeStore,
      artifacts: this.options.artifacts,
      browserExecutor: this.options.browserExecutor,
      structured: this.options.structured,
      visual: this.options.visual,
      modelGateway: this.options.modelGateway,
      strategy,
      leaseTtlMs:this.options.leaseTtlMs
    });
    const process = await coordinator.process(admitted.run.runId, this.workerId(purpose));
    if ((process.status !== "completed" && process.status !== "already_completed") || process.acquiredContent.length === 0) {
      throw new Error(`Web Operator ${purpose} run did not complete acquisition`);
    }
    const finalized = await this.finalizeSuccessfulAgentRun(admitted.run.runId, now);
    return {
      state: "acquired_by_agent",
      run: finalized.run,
      process,
      workflow: finalized.workflow,
      acquiredContent: finalized.acquiredContent,
      modelCalls: process.modelCalls
    };
  }

  async finalizeSuccessfulAgentRun(runId: string, now = new Date()): Promise<FinalizedWorkflowRun> {
    const run = await this.options.runtimeStore.getRun(runId);
    if (!run) throw new Error(`agent run not found: ${runId}`);
    if (run.state !== "completed") throw new Error(`agent run is not completed: ${runId}`);
    const accepted = await this.options.runtimeStore.getAcceptedContent(runId);
    if (accepted.length === 0) throw new Error(`agent run has no accepted content: ${runId}`);

    const timestamp = now.toISOString();
    const lifecycle = this.lifecycleCoordinator();
    const { candidate } = await lifecycle.produceCandidateFromRun(run, timestamp);
    let workflow = candidate;

    if (workflow.state === "CANDIDATE") {
      const validation = (await this.options.workflowStore.getValidationResult(workflow.id)) ??
        await lifecycle.validateCandidate(workflow.id, "workflow-validator", timestamp);
      if (!validation.passed) throw new Error(`compiled workflow failed validation: ${workflow.id}`);
      workflow = (await this.options.workflowStore.getWorkflowCandidate(workflow.id))!;
    }

    if (workflow.state === "VALIDATED") {
      workflow = await lifecycle.promoteValidatedWorkflow(workflow.id, "workflow-promotion-controller", timestamp);
    } else if (workflow.state !== "ACTIVE") {
      throw new Error(`workflow finalization cannot activate workflow in ${workflow.state} state: ${workflow.id}`);
    }

    return {
      run,
      workflow,
      acquiredContent: accepted.find((content) => content.canonicalUrl === workflow.candidate.canonicalUrl) ?? accepted[0]
    };
  }

  private async replayWorkflow(
    workflow: WorkflowCandidate,
    request: ClosedLoopAcquisitionRequest,
    now: Date
  ): Promise<WorkflowExecutionResult> {
    const allocation = await this.options.browserExecutor.allocate({
      runId: makeId("workflow_replay_run", request.tenantId, request.resourceId, request.idempotencyKey, workflow.id),
      tenantId: request.tenantId,
      generation: workflow.version,
      allowedOrigins: request.policy.allowedOrigins
    });
    try {
      return await new DeterministicWorkflowExecutor({
        artifacts: this.options.artifacts,
        browserExecutor: this.options.browserExecutor,
        structured: this.options.structured,
        policy: new PolicyEngine(request.policy)
      }).execute({
        workflow,
        run: this.replayRun(request, workflow, allocation.generation, now),
        allocation,
        budget: request.budgetLimits ?? DEFAULT_SLICE_BUDGET
      });
    } finally {
      await this.options.browserExecutor.close(allocation).catch(() => undefined);
    }
  }

  private async recordFailure(
    workflow: WorkflowCandidate,
    replay: WorkflowExecutionResult,
    now: Date
  ): Promise<WorkflowFailureEvidence[]> {
    const failureClass = replay.failureClass ?? "structural_site_change";
    const evidence: WorkflowFailureEvidence = {
      id: makeId("workflow_failure", workflow.id, failureClass, now.toISOString(), await failureIdentity(replay)),
      workflowId: workflow.id,
      resourceId: workflow.resourceId,
      failureClass,
      transient: failureClass === "transient_browser_network_failure",
      details: {
        replayState: replay.state,
        modelCalls: replay.modelCalls
      },
      observedAt: now.toISOString()
    };
    await this.options.workflowStore.saveFailureEvidence(evidence);
    return this.options.workflowStore.listFailureEvidence(workflow.id);
  }

  private lifecycleCoordinator(): WorkflowLifecycleCoordinator {
    return new WorkflowLifecycleCoordinator({
      workflowStore: this.options.workflowStore,
      captureService: new WorkflowCaptureService({
        runtimeStore: this.options.runtimeStore,
        workflowStore: this.options.workflowStore,
        softwareVersion: this.options.softwareVersion,
        toolSchemaVersion: this.options.toolSchemaVersion
      }),
      compiler: new WorkflowCandidateCompiler(),
      validator: new WorkflowValidator(),
      minimumStructuralEvidence: this.options.minimumStructuralEvidence ?? 2
    });
  }

  private replayRun(request: ClosedLoopAcquisitionRequest, workflow: WorkflowCandidate, generation: number, now: Date): AgentRun {
    const timestamp = now.toISOString();
    return {
      runId: makeId("workflow_replay_run", request.tenantId, request.resourceId, request.idempotencyKey, workflow.id),
      tenantId: request.tenantId,
      resourceId: request.resourceId,
      idempotencyKey: `${request.idempotencyKey}:workflow:${workflow.id}`,
      objective: request.objective,
      mode: "known_candidate",
      state: "running",
      generation,
      policySnapshotId: request.policy.id,
      completionContractVersion: "known-candidate-watermark-v1",
      createdAt: timestamp,
      updatedAt: timestamp,
      candidate: request.candidate
    };
  }

  private workerId(purpose: "discovery" | "repair"): string {
    return this.options.workerIdFactory?.() ?? `web-operator-${purpose}`;
  }
}

async function failureIdentity(replay: WorkflowExecutionResult): Promise<string> {
  return JSON.stringify({
    state: replay.state,
    failureClass: replay.failureClass,
    canonicalUrl: replay.acquiredContent?.canonicalUrl
  });
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
