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
  enabled: boolean;
}

export type ClosedLoopAcquisitionOutcome =
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
      modelCalls: 0;
    };

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
    minimumStructuralEvidence?: number;
    workerIdFactory?: () => string;
  }) {}

  async acquire(request: ClosedLoopAcquisitionRequest, now = new Date()): Promise<ClosedLoopAcquisitionOutcome> {
    const active = await this.options.workflowStore.getActiveWorkflow(request.resourceId);
    if (!active) return this.runAgentAndPromote(request, "discovery", now);

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

  private async handleReplayFailure(
    active: WorkflowCandidate,
    replay: WorkflowExecutionResult,
    request: ClosedLoopAcquisitionRequest,
    now: Date
  ): Promise<ClosedLoopAcquisitionOutcome> {
    const evidence = await this.recordFailure(active, replay, now);
    const lifecycle = this.lifecycleCoordinator();
    const repair = await lifecycle.decideRepair({
      workflowId: active.id,
      attempts: evidence.map((entry) => ({
        failureClass: entry.failureClass,
        transient: entry.transient
      }))
    });
    if (!repair.repairRequired) {
      return {
        state: "waiting_for_repair_evidence",
        workflow: active,
        failureEvidence: evidence,
        replay,
        modelCalls: 0
      };
    }
    return this.runAgentAndPromote({
      ...request,
      idempotencyKey: `${request.idempotencyKey}:repair:${active.version + 1}`,
      objective: `${request.objective}\n\nRepair the active workflow ${active.id}. Previous deterministic replay failed with ${repair.failureClass}. Reason freely from current observations; do not mechanically mutate selectors.`
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
      strategy
    });
    const process = await coordinator.process(admitted.run.runId, this.workerId(purpose));
    if (process.status !== "completed" || process.acquiredContent.length === 0) {
      throw new Error(`Web Operator ${purpose} run did not complete acquisition`);
    }
    const run = (await this.options.runtimeStore.getRun(admitted.run.runId))!;
    const { candidate } = await this.lifecycleCoordinator().produceCandidateFromRun(run, new Date().toISOString());
    const validation = await this.lifecycleCoordinator().validateCandidate(candidate.id, "workflow-validator", new Date().toISOString());
    if (!validation.passed) throw new Error(`compiled workflow failed validation: ${candidate.id}`);
    const active = await this.lifecycleCoordinator().promoteValidatedWorkflow(candidate.id, "workflow-promotion-controller", new Date().toISOString());
    return {
      state: "acquired_by_agent",
      run,
      process,
      workflow: active,
      acquiredContent: process.acquiredContent[0],
      modelCalls: process.modelCalls
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
