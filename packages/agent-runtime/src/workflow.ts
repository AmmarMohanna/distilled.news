import type {
  AcquiredContent,
  AgentRun,
  AgentRunBudgetLimits,
  AgentToolResult,
  AgentPageState,
  CandidateIdentity,
  EffectCertainty,
  InteractionCapability,
  PlannedAction,
  ObservationEnvelope,
  ToolName
} from "./contracts";
import { makeId } from "./contracts";
import type { RuntimeStore } from "./persistence";
import type { PolicyEngine } from "./policy";
import type { BrowserAllocation, BrowserExecutorPort, StructuredBrowserUsePort } from "./browser";
import { CompletionVerifier } from "./completion";
import { projectPageState, sha256Text, type ArtifactStore } from "./observations";

export type WorkflowLifecycleState =
  | "CANDIDATE"
  | "VALIDATED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "REJECTED"
  | "INVALID"
  | "ROLLED_BACK";

export type DeterministicOperationKind =
  | "navigate"
  | "locate_semantic_target"
  | "extract_listing"
  | "follow_canonical_article"
  | "paginate"
  | "stop_at_watermark"
  | "extract_article"
  | "verify_expected_condition";

export interface LocatorAlternative {
  kind: "semantic_label" | "url_pattern" | "page_type" | "article_canonical";
  value: string;
  confidence: number;
}

export interface DeterministicWorkflowOperation {
  id: string;
  kind: DeterministicOperationKind;
  locatorAlternatives: LocatorAlternative[];
  requiredCapability?: InteractionCapability["actionClass"];
  expected?: {
    urlIncludes?: string;
    pageType?: "listing" | "article" | "challenge" | "unknown";
    watermarkObserved?: boolean;
    candidateCanonicalUrl?: string;
  };
}

export interface WorkflowVisibleAction {
  tool: ToolName;
  arguments: unknown;
  observationBeforeId?: string;
  observationAfterId?: string;
  capabilityToken?: string;
  effectCertainty: EffectCertainty;
  browserGeneration: number;
  occurredAt: string;
}

export interface SourceDiscoveryEvidence {
  canonicalResourceIdentity: {
    resourceId: string;
    candidateCanonicalUrl: string;
    publisherId?: string;
  };
  listingUrlCandidates: string[];
  paginationBehavior: {
    watermarkObserved: boolean;
    exhausted: boolean;
    evidenceObservationIds: string[];
  };
  articleUrlPatterns: string[];
  publicationTimeEvidence: Array<{
    observationId: string;
    publisherTimestamp: string;
  }>;
  pageTypeObservations: Array<{
    observationId: string;
    url: string;
    pageType: AgentPageState["pageType"];
    title: string;
  }>;
  locatorEvidence: Array<{
    observationId: string;
    kind: string;
    label?: string;
    destinationUrl?: string;
    safeAction?: string;
    capability?: InteractionCapability["actionClass"];
  }>;
  requiredReadCapabilities: InteractionCapability["actionClass"][];
  stoppingWatermarkEvidence: Array<{
    observationId: string;
    url: string;
    watermarkObserved: boolean;
    exhausted: boolean;
  }>;
}

export interface WorkflowCaptureBundle {
  id: string;
  runId: string;
  tenantId: string;
  resourceId: string;
  candidate: CandidateIdentity;
  actions: WorkflowVisibleAction[];
  observationIds: string[];
  acceptedContentId?: string;
  successfulAlternatives: string[];
  failedAlternatives: string[];
  discoveryEvidence: SourceDiscoveryEvidence;
  extractionEvidence: {
    observationId: string;
    canonicalUrl: string;
    contentHash: string;
  }[];
  completionEvidence: {
    proposalId?: string;
    acceptanceId?: string;
    citedObservationIds: string[];
    watermarkObserved: boolean;
  };
  runtime: {
    softwareVersion: string;
    toolSchemaVersion: string;
    workflowSchemaVersion: string;
  };
  createdAt: string;
}

export interface WorkflowCandidate {
  id: string;
  tenantId: string;
  resourceId: string;
  sourceCaptureId: string;
  candidate: CandidateIdentity;
  state: WorkflowLifecycleState;
  version: number;
  operations: DeterministicWorkflowOperation[];
  unsupportedGaps: string[];
  createdAt: string;
  validatedAt?: string;
  activatedAt?: string;
  supersededBy?: string;
}

export interface WorkflowValidationResult {
  workflowId: string;
  passed: boolean;
  criteria: Record<string, boolean>;
  failureClass?: StructuralFailureClass;
  validatedAt: string;
}

export type WorkflowFinalizationReason =
  | "candidate_production_failed"
  | "validation_failed"
  | "promotion_failed"
  | "workflow_state_ineligible";

export type WorkflowFinalizationOutcome =
  | {
      runId: string;
      state: "PROMOTED";
      workflowId: string;
      recordedAt: string;
    }
  | {
      runId: string;
      state: "NOT_PROMOTED";
      reason: WorkflowFinalizationReason;
      captureId?: string;
      workflowId?: string;
      validation?: WorkflowValidationResult;
      recordedAt: string;
    };

export interface WorkflowFailureEvidence {
  id: string;
  workflowId: string;
  resourceId: string;
  failureClass: StructuralFailureClass;
  transient: boolean;
  operationId?: string;
  details: Record<string, unknown>;
  observedAt: string;
}

export type StructuralFailureClass =
  | "transient_browser_network_failure"
  | "authentication_or_challenge"
  | "source_unavailable"
  | "structural_site_change"
  | "extraction_mismatch"
  | "watermark_ambiguity"
  | "policy_restriction";

export interface WorkflowRepository {
  saveCaptureBundle(bundle: WorkflowCaptureBundle): Promise<void>;
  getCaptureBundle(id: string): Promise<WorkflowCaptureBundle | null>;
  saveWorkflowCandidate(candidate: WorkflowCandidate): Promise<void>;
  getWorkflowCandidate(id: string): Promise<WorkflowCandidate | null>;
  listWorkflowCandidates(resourceId: string): Promise<WorkflowCandidate[]>;
  getActiveWorkflow(resourceId: string): Promise<WorkflowCandidate | null>;
  saveValidationResult(result: WorkflowValidationResult): Promise<void>;
  getValidationResult(workflowId: string): Promise<WorkflowValidationResult | null>;
  saveFinalizationOutcome(outcome: WorkflowFinalizationOutcome): Promise<void>;
  getFinalizationOutcome(runId: string): Promise<WorkflowFinalizationOutcome | null>;
  saveFailureEvidence(evidence: WorkflowFailureEvidence): Promise<void>;
  listFailureEvidence(workflowId: string): Promise<WorkflowFailureEvidence[]>;
  promoteWorkflow(workflowId: string, validatorId: string, now?: string): Promise<WorkflowCandidate>;
  markWorkflow(workflowId: string, state: Extract<WorkflowLifecycleState, "REJECTED" | "INVALID" | "ROLLED_BACK">, now?: string): Promise<WorkflowCandidate>;
}

export class MemoryWorkflowRepository implements WorkflowRepository {
  private readonly captures = new Map<string, WorkflowCaptureBundle>();
  private readonly workflows = new Map<string, WorkflowCandidate>();
  private readonly validations = new Map<string, WorkflowValidationResult>();
  private readonly failures = new Map<string, WorkflowFailureEvidence>();
  private readonly finalizations = new Map<string, WorkflowFinalizationOutcome>();

  async saveCaptureBundle(bundle: WorkflowCaptureBundle): Promise<void> {
    const existing = this.captures.get(bundle.id);
    if (existing && JSON.stringify(captureIdentity(existing)) !== JSON.stringify(captureIdentity(bundle))) throw new Error("workflow capture identity collision");
    if (existing) return;
    this.captures.set(bundle.id, structuredClone(bundle));
  }

  async getCaptureBundle(id: string): Promise<WorkflowCaptureBundle | null> {
    return structuredClone(this.captures.get(id) ?? null);
  }

  async saveWorkflowCandidate(candidate: WorkflowCandidate): Promise<void> {
    const existing = this.workflows.get(candidate.id);
    if (existing && JSON.stringify(workflowIdentity(existing)) !== JSON.stringify(workflowIdentity(candidate))) {
      throw new Error("workflow candidate identity collision");
    }
    if (existing) return;
    this.workflows.set(candidate.id, structuredClone(candidate));
  }

  async getWorkflowCandidate(id: string): Promise<WorkflowCandidate | null> {
    return structuredClone(this.workflows.get(id) ?? null);
  }

  async listWorkflowCandidates(resourceId: string): Promise<WorkflowCandidate[]> {
    return [...this.workflows.values()].filter((workflow) => workflow.resourceId === resourceId).map((workflow) => structuredClone(workflow));
  }

  async getActiveWorkflow(resourceId: string): Promise<WorkflowCandidate | null> {
    return structuredClone([...this.workflows.values()].find((workflow) => workflow.resourceId === resourceId && workflow.state === "ACTIVE") ?? null);
  }

  async saveValidationResult(result: WorkflowValidationResult): Promise<void> {
    this.validations.set(result.workflowId, structuredClone(result));
    const workflow = this.workflows.get(result.workflowId);
    if (workflow) {
      workflow.state = result.passed ? "VALIDATED" : "INVALID";
      workflow.validatedAt = result.validatedAt;
    }
  }

  async getValidationResult(workflowId: string): Promise<WorkflowValidationResult | null> {
    return structuredClone(this.validations.get(workflowId) ?? null);
  }

  async saveFinalizationOutcome(outcome: WorkflowFinalizationOutcome): Promise<void> {
    this.finalizations.set(outcome.runId, structuredClone(outcome));
  }

  async getFinalizationOutcome(runId: string): Promise<WorkflowFinalizationOutcome | null> {
    return structuredClone(this.finalizations.get(runId) ?? null);
  }

  async saveFailureEvidence(evidence: WorkflowFailureEvidence): Promise<void> {
    const existing = this.failures.get(evidence.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(evidence)) throw new Error("workflow failure evidence identity collision");
    this.failures.set(evidence.id, structuredClone(evidence));
  }

  async listFailureEvidence(workflowId: string): Promise<WorkflowFailureEvidence[]> {
    return [...this.failures.values()]
      .filter((evidence) => evidence.workflowId === workflowId)
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
      .map((evidence) => structuredClone(evidence));
  }

  async promoteWorkflow(workflowId: string, _validatorId: string, now = new Date().toISOString()): Promise<WorkflowCandidate> {
    const workflow = this.requireWorkflow(workflowId);
    if (workflow.state !== "VALIDATED") throw new Error("only VALIDATED workflows can be promoted");
    for (const active of this.workflows.values()) {
      if (active.resourceId === workflow.resourceId && active.state === "ACTIVE") {
        active.state = "SUPERSEDED";
        active.supersededBy = workflow.id;
      }
    }
    workflow.state = "ACTIVE";
    workflow.activatedAt = now;
    return structuredClone(workflow);
  }

  async markWorkflow(workflowId: string, state: Extract<WorkflowLifecycleState, "REJECTED" | "INVALID" | "ROLLED_BACK">, now = new Date().toISOString()): Promise<WorkflowCandidate> {
    const workflow = this.requireWorkflow(workflowId);
    workflow.state = state;
    if (state === "ROLLED_BACK") workflow.activatedAt = workflow.activatedAt ?? now;
    return structuredClone(workflow);
  }

  private requireWorkflow(workflowId: string): WorkflowCandidate {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`workflow not found: ${workflowId}`);
    return workflow;
  }
}

export class WorkflowCaptureService {
  constructor(private readonly input: {
    runtimeStore: RuntimeStore;
    workflowStore: WorkflowRepository;
    softwareVersion: string;
    toolSchemaVersion: string;
  }) {}

  async capture(run: AgentRun, now = new Date().toISOString()): Promise<WorkflowCaptureBundle> {
    const events = await this.input.runtimeStore.listEvents(run.runId);
    const accepted = await this.input.runtimeStore.getAcceptedContent(run.runId);
    const actions: WorkflowVisibleAction[] = [];
    const observationIds: string[] = [];
    const observations: ObservationEnvelope[] = [];
    for (const event of events) {
      if (event.type === "agent.observation.persisted") {
        const data = event.data as { observationId?: string };
        if (data.observationId) observationIds.push(data.observationId);
      }
      if (event.type === "agent.tool.result_recorded") {
        const result = event.data as AgentToolResult;
        const toolCall = await this.input.runtimeStore.getToolCall(result.toolCallId);
        const intent = await this.input.runtimeStore.getToolIntent(result.toolCallId);
        if (toolCall && intent) {
          const observation = await this.input.runtimeStore.getObservationForToolCall(result.toolCallId);
          if (observation) observations.push(observation);
          actions.push({
            tool: toolCall.tool,
            arguments: intent.arguments,
            observationAfterId: observation?.id,
            effectCertainty: result.effectCertainty,
            browserGeneration: result.generation,
            occurredAt: result.completedAt
          });
        }
      }
    }
    const extractionEvidence = accepted.map((content) => ({
      observationId: content.observationId,
      canonicalUrl: content.canonicalUrl,
      contentHash: content.contentHash
    }));
    const bundle: WorkflowCaptureBundle = {
      id: makeId("workflow_capture", run.runId, observationIds.join(","), accepted[0]?.acceptanceId ?? "none"),
      runId: run.runId,
      tenantId: run.tenantId,
      resourceId: run.resourceId,
      candidate: structuredClone(run.candidate),
      actions,
      observationIds,
      acceptedContentId: accepted[0]?.acceptanceId,
      successfulAlternatives: actions.filter((action) => action.effectCertainty === "known_applied").map((action) => action.tool),
      failedAlternatives: actions.filter((action) => action.effectCertainty !== "known_applied").map((action) => action.tool),
      discoveryEvidence: buildDiscoveryEvidence(run, observations, accepted),
      extractionEvidence,
      completionEvidence: {
        citedObservationIds: observationIds,
        watermarkObserved: events.some((event) => JSON.stringify(event.data).includes('"watermarkObserved":true'))
      },
      runtime: {
        softwareVersion: this.input.softwareVersion,
        toolSchemaVersion: this.input.toolSchemaVersion,
        workflowSchemaVersion: "workflow-capture-v1"
      },
      createdAt: now
    };
    await this.input.workflowStore.saveCaptureBundle(bundle);
    return (await this.input.workflowStore.getCaptureBundle(bundle.id)) ?? bundle;
  }
}

export class WorkflowCandidateCompiler {
  compile(bundle: WorkflowCaptureBundle, now = new Date().toISOString()): WorkflowCandidate {
    const operations: DeterministicWorkflowOperation[] = [];
    const unsupportedGaps: string[] = [];
    for (const [index, action] of bundle.actions.entries()) {
      const id = makeId("workflow_operation", bundle.id, index, action.tool);
      if (action.tool === "browser.navigate@1") {
        const args = action.arguments as { url?: string };
        if (!args.url) unsupportedGaps.push(`navigate action ${index} missing URL`);
        else {
          try {
            operations.push({
              id,
              kind: "navigate",
              locatorAlternatives: [{ kind: "url_pattern", value: args.url, confidence: 1 }],
              expected: { urlIncludes: new URL(args.url).pathname }
            });
          } catch {
            unsupportedGaps.push(`navigate action ${index} has invalid URL`);
          }
        }
      } else if (action.tool === "browser.follow_link@1" || action.tool === "computer.click@1") {
        operations.push({
          id,
          kind: "follow_canonical_article",
          locatorAlternatives: [{ kind: "article_canonical", value: bundle.candidate.canonicalUrl, confidence: 1 }],
          requiredCapability: action.tool === "browser.follow_link@1" ? "follow_read_link" : "visual_read_link",
          expected: { candidateCanonicalUrl: bundle.candidate.canonicalUrl }
        });
      } else if (action.tool === "browser.extract@1") {
        operations.push({
          id,
          kind: "extract_article",
          locatorAlternatives: [{ kind: "article_canonical", value: bundle.candidate.canonicalUrl, confidence: 1 }],
          expected: { pageType: "article", candidateCanonicalUrl: bundle.candidate.canonicalUrl }
        });
      } else if (action.tool === "run.propose_completion@1") {
        operations.push({ id, kind: "verify_expected_condition", locatorAlternatives: [], expected: { watermarkObserved: true } });
      } else if (action.tool === "browser.query_page_state@1" || action.tool === "browser.inspect_dom@1" || action.tool === "browser.inspect_accessibility_tree@1") {
        operations.push({ id, kind: "extract_listing", locatorAlternatives: [{ kind: "page_type", value: "listing", confidence: 0.6 }] });
      } else if (action.tool === "browser.scroll@1") {
        operations.push({ id, kind: "paginate", locatorAlternatives: [{ kind: "page_type", value: "listing", confidence: 0.5 }] });
      } else {
        unsupportedGaps.push(`unsupported action ${action.tool} at index ${index}`);
      }
    }
    if (bundle.completionEvidence.watermarkObserved) {
      operations.push({
        id: makeId("workflow_operation", bundle.id, "watermark"),
        kind: "stop_at_watermark",
        locatorAlternatives: [],
        expected: { watermarkObserved: true }
      });
    }
    return {
      id: makeId("workflow_candidate", bundle.tenantId, bundle.resourceId, bundle.id, JSON.stringify(operations)),
      tenantId: bundle.tenantId,
      resourceId: bundle.resourceId,
      sourceCaptureId: bundle.id,
      candidate: structuredClone(bundle.candidate),
      state: "CANDIDATE",
      version: 1,
      operations,
      unsupportedGaps,
      createdAt: now
    };
  }
}

export class WorkflowValidator {
  async validate(candidate: WorkflowCandidate, evidence: WorkflowCaptureBundle, now = new Date().toISOString()): Promise<WorkflowValidationResult> {
    const matchingExtraction = evidence.extractionEvidence.find((entry) => entry.canonicalUrl === candidate.candidate.canonicalUrl);
    const matchingPublicationEvidence = evidence.discoveryEvidence.publicationTimeEvidence.some((entry) =>
      entry.publisherTimestamp.trim().length > 0
    );
    const criteria = {
      hasOperations: candidate.operations.length > 0,
      hasNoUnsupportedGaps: candidate.unsupportedGaps.length === 0,
      candidateIdentityMatches: candidate.candidate.candidateId === evidence.candidate.candidateId &&
        candidate.candidate.canonicalUrl === evidence.candidate.canonicalUrl,
      hasSuccessfulExtractionEvidence: Boolean(matchingExtraction),
      extractionHasContentHash: Boolean(matchingExtraction?.contentHash),
      hasPublicationTimestampEvidence: matchingPublicationEvidence,
      hasPageTypeEvidence: evidence.discoveryEvidence.pageTypeObservations.some((entry) => entry.pageType === "article"),
      hasWatermarkEvidence: evidence.completionEvidence.watermarkObserved ||
        evidence.discoveryEvidence.stoppingWatermarkEvidence.some((entry) => entry.watermarkObserved || entry.exhausted) ||
        Boolean(evidence.discoveryEvidence.paginationBehavior?.watermarkObserved || evidence.discoveryEvidence.paginationBehavior?.exhausted),
      hasAcceptedContentReference: Boolean(evidence.acceptedContentId),
      onlyDeterministicOperations: candidate.operations.every((operation) => operation.kind !== undefined)
    };
    const passed = Object.values(criteria).every(Boolean);
    return {
      workflowId: candidate.id,
      passed,
      criteria,
      failureClass: passed ? undefined : "structural_site_change",
      validatedAt: now
    };
  }
}

export interface WorkflowRepairDecision {
  repairRequired: boolean;
  sourceWorkflowId: string;
  failureClass?: StructuralFailureClass;
  reason: string;
}

export class WorkflowLifecycleCoordinator {
  constructor(private readonly options: {
    workflowStore: WorkflowRepository;
    captureService?: WorkflowCaptureService;
    compiler?: WorkflowCandidateCompiler;
    validator?: WorkflowValidator;
    minimumStructuralEvidence?: number;
  }) {}

  async produceCandidateFromRun(run: AgentRun, now = new Date().toISOString()): Promise<{
    capture: WorkflowCaptureBundle;
    candidate: WorkflowCandidate;
  }> {
    if (!this.options.captureService) throw new Error("workflow capture service is required to produce a candidate from a run");
    const capture = await this.options.captureService.capture(run, now);
    const existing = await this.options.workflowStore.listWorkflowCandidates(run.resourceId);
    const existingForCapture = existing.find((workflow) => workflow.sourceCaptureId === capture.id);
    if (existingForCapture) return { capture, candidate: existingForCapture };
    const compiled = (this.options.compiler ?? new WorkflowCandidateCompiler()).compile(capture, now);
    const candidate = {
      ...compiled,
      version: Math.max(0, ...existing.map((workflow) => workflow.version)) + 1
    };
    await this.options.workflowStore.saveWorkflowCandidate(candidate);
    return { capture, candidate };
  }

  async validateCandidate(candidateId: string, validatorId: string, now = new Date().toISOString()): Promise<WorkflowValidationResult> {
    const candidate = await this.requireCandidate(candidateId);
    const capture = await this.options.workflowStore.getCaptureBundle(candidate.sourceCaptureId);
    if (!capture) throw new Error(`workflow capture not found: ${candidate.sourceCaptureId}`);
    const result = await (this.options.validator ?? new WorkflowValidator()).validate(candidate, capture, now);
    await this.options.workflowStore.saveValidationResult(result);
    await this.options.workflowStore.saveWorkflowCandidate({
      ...candidate,
      state: result.passed ? "VALIDATED" : "INVALID",
      validatedAt: now
    });
    return result;
  }

  async promoteValidatedWorkflow(candidateId: string, validatorId: string, now = new Date().toISOString()): Promise<WorkflowCandidate> {
    const candidate = await this.requireCandidate(candidateId);
    if (candidate.state !== "VALIDATED") throw new Error("only VALIDATED workflows can be promoted");
    return this.options.workflowStore.promoteWorkflow(candidateId, validatorId, now);
  }

  async decideRepair(input: {
    workflowId: string;
    attempts: Array<{ failureClass: StructuralFailureClass; transient: boolean }>;
  }): Promise<WorkflowRepairDecision> {
    const workflow = await this.requireCandidate(input.workflowId);
    const failureClass = classifyWorkflowFailure({
      attempts: input.attempts,
      minimumStructuralEvidence: this.options.minimumStructuralEvidence ?? 2
    });
    if (!failureClass) return { repairRequired: false, sourceWorkflowId: workflow.id, reason: "insufficient_failure_evidence" };
    if (failureClass === "transient_browser_network_failure") {
      return { repairRequired: false, sourceWorkflowId: workflow.id, failureClass, reason: "transient_failure_requires_backoff" };
    }
    if (failureClass === "authentication_or_challenge" || failureClass === "policy_restriction") {
      return { repairRequired: false, sourceWorkflowId: workflow.id, failureClass, reason: "explicit_authorization_required" };
    }
    if (workflow.state !== "ACTIVE") {
      return { repairRequired: false, sourceWorkflowId: workflow.id, failureClass, reason: "only_active_workflows_trigger_repair" };
    }
    return { repairRequired: true, sourceWorkflowId: workflow.id, failureClass, reason: "confirmed_structural_failure" };
  }

  private async requireCandidate(candidateId: string): Promise<WorkflowCandidate> {
    const candidate = await this.options.workflowStore.getWorkflowCandidate(candidateId);
    if (!candidate) throw new Error(`workflow candidate not found: ${candidateId}`);
    return candidate;
  }
}

export interface WorkflowExecutionResult {
  workflowId: string;
  state: "completed" | "failed" | "suspended";
  acquiredContent?: AcquiredContent;
  failureClass?: StructuralFailureClass;
  modelCalls: 0;
}

export class DeterministicWorkflowExecutor {
  constructor(private readonly options: {
    artifacts: ArtifactStore;
    browserExecutor: BrowserExecutorPort;
    structured: StructuredBrowserUsePort;
    policy: PolicyEngine;
    completionVerifier?: CompletionVerifier;
  }) {}

  async execute(input: {
    workflow: WorkflowCandidate;
    run: AgentRun;
    allocation: BrowserAllocation;
    budget: AgentRunBudgetLimits;
    signal?: AbortSignal;
  }): Promise<WorkflowExecutionResult> {
    if (input.workflow.state !== "ACTIVE" && input.workflow.state !== "VALIDATED") {
      throw new Error("deterministic workflow execution requires VALIDATED or ACTIVE workflow");
    }
    const remaining = structuredClone(input.budget);
    let latest: ObservationEnvelope | undefined;
    for (const operation of input.workflow.operations) {
      input.signal?.throwIfAborted();
      if (operation.kind === "navigate") {
        const url = operation.locatorAlternatives.find((locator) => locator.kind === "url_pattern")?.value;
        if (!url) return { workflowId: input.workflow.id, state: "failed", failureClass: "structural_site_change", modelCalls: 0 };
        if (!reserveBudget(remaining, { browserActions: 1, navigations: 1, pages: 1 })) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        if (!this.policyAllows(input.run, input.allocation, operation.id, { tool: "browser.navigate@1", arguments: { url } }, workflowPageState(latest), remaining)) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        const output = await this.options.structured.navigate(input.allocation, url);
        latest = await this.persistDetachedObservation(input.run, input.allocation, operation.id, output, remaining);
      } else if (operation.kind === "follow_canonical_article") {
        if (!reserveBudget(remaining, { browserActions: 1, navigations: 1, pages: 1 })) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        if (!this.policyAllows(
          input.run,
          input.allocation,
          operation.id,
          { tool: "browser.navigate@1", arguments: { url: input.workflow.candidate.canonicalUrl } },
          workflowPageState(latest),
          remaining
        )) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        const output = await this.options.structured.navigate(input.allocation, input.workflow.candidate.canonicalUrl);
        latest = await this.persistDetachedObservation(input.run, input.allocation, operation.id, output, remaining);
      } else if (operation.kind === "extract_article") {
        if (!reserveBudget(remaining, { browserActions: 1 })) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        if (!this.policyAllows(input.run, input.allocation, operation.id, { tool: "browser.extract@1", arguments: {} }, workflowPageState(latest), remaining)) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "policy_restriction", modelCalls: 0 };
        }
        const output = await this.options.structured.extract(input.allocation);
        latest = await this.persistDetachedObservation(input.run, input.allocation, operation.id, output, remaining);
        if (!output.article) return { workflowId: input.workflow.id, state: "failed", failureClass: "extraction_mismatch", modelCalls: 0 };
        if (normalizeUrl(output.article.canonicalUrl) !== normalizeUrl(input.workflow.candidate.canonicalUrl)) {
          return { workflowId: input.workflow.id, state: "failed", failureClass: "extraction_mismatch", modelCalls: 0 };
        }
        const contentHash = await sha256Text(output.article.body);
        const acquiredContent: AcquiredContent = {
          acceptanceId: makeId("acquired", input.run.tenantId, input.run.resourceId, input.workflow.candidate.candidateId, output.article.canonicalUrl, contentHash),
          runId: input.run.runId,
          tenantId: input.run.tenantId,
          resourceId: input.run.resourceId,
          candidateId: input.workflow.candidate.candidateId,
          acquisitionAttempt: input.workflow.candidate.acquisitionAttempt,
          generation: input.allocation.generation,
          turnId: makeId("deterministic_turn", input.run.runId, input.workflow.id),
          modelCallId: makeId("deterministic_model_call", input.run.runId, input.workflow.id),
          toolCallId: operation.id,
          observationId: latest.id,
          rawArtifactRef: latest.raw.ref,
          canonicalUrl: output.article.canonicalUrl,
          finalUrl: output.finalUrl,
          publisherTimestamp: output.article.publisherTimestamp,
          title: output.article.title,
          excerpt: output.article.excerpt,
          body: output.article.body,
          contentHash,
          acceptedAt: new Date().toISOString()
        };
        return { workflowId: input.workflow.id, state: "completed", acquiredContent, modelCalls: 0 };
      }
    }
    return { workflowId: input.workflow.id, state: "failed", failureClass: "extraction_mismatch", modelCalls: 0 };
  }

  private async persistDetachedObservation(
    run: AgentRun,
    allocation: BrowserAllocation,
    operationId: string,
    output: Awaited<ReturnType<StructuredBrowserUsePort["navigate"]>>,
    remainingBudget: AgentRunBudgetLimits
  ): Promise<ObservationEnvelope> {
    const pageState = projectPageState({
      url: output.url,
      title: output.title,
      pageRevision: output.pageRevision,
      controls: output.controls,
      article: output.article ? {
        title: output.article.title,
        canonicalUrl: output.article.canonicalUrl,
        publisherTimestamp: output.article.publisherTimestamp,
        contentHash: await sha256Text(output.article.body)
      } : undefined,
      watermarkObserved: output.watermarkObserved,
      challengeState: output.challengeState,
      progress: {
        watermarkObserved: output.watermarkObserved,
        validatedListingBoundaryReached: false,
        articleExtracted: Boolean(output.article),
        expectedCandidateId: run.candidate.candidateId
      },
      remainingBudget,
      policyVisibleCapabilities: this.options.policy.visibleCapabilities()
    });
    return {
      id: makeId("workflow_observation", run.runId, operationId, output.pageRevision),
      runId: run.runId,
      turnId: makeId("deterministic_turn", run.runId, operationId),
      toolCallId: operationId,
      browserSessionId: allocation.sessionId,
      browserGeneration: allocation.generation,
      pageId: output.pageId,
      pageRevision: output.pageRevision,
      originUrl: output.url,
      originDomain: new URL(output.url).hostname,
      finalUrl: output.finalUrl,
      retrievedAt: new Date().toISOString(),
      contentType: output.contentType,
      trustClassification: "UNTRUSTED_EXTERNAL",
      representationType: output.article ? "article" : "page_state",
      raw: await this.options.artifacts.put(`workflow/${run.runId}/${operationId}/raw`, output.raw, output.contentType),
      presented: await this.options.artifacts.put(`workflow/${run.runId}/${operationId}/presented`, new TextEncoder().encode(JSON.stringify(pageState)), "application/json"),
      originalSize: output.raw.byteLength,
      presentedSize: new TextEncoder().encode(JSON.stringify(pageState)).byteLength,
      truncated: false,
      transformationVersion: "observation-sanitize-v1",
      observationSource: output.observationSource,
      protocolSnapshotVersion: output.protocolSnapshotVersion,
      redactions: [],
      modelRepresentation: pageState
    };
  }

  private policyAllows(
    run: AgentRun,
    allocation: BrowserAllocation,
    toolCallId: string,
    action: PlannedAction,
    pageState: AgentPageState | undefined,
    remainingBudget: AgentRunBudgetLimits
  ): boolean {
    return this.options.policy.evaluate({
      runId: run.runId,
      toolCallId,
      action,
      pageState: pageState ?? projectPageState({
        url: run.candidate.canonicalUrl,
        title: "",
        pageRevision: "deterministic-workflow-initial",
        controls: [],
        challengeState: "NO_CHALLENGE",
        progress: {
          watermarkObserved: false,
          validatedListingBoundaryReached: false,
          articleExtracted: false,
          expectedCandidateId: run.candidate.candidateId
        },
        remainingBudget,
        policyVisibleCapabilities: this.options.policy.visibleCapabilities()
      }),
      tenantId: run.tenantId,
      generation: allocation.generation
    }).allowed;
  }
}

export function classifyWorkflowFailure(input: {
  attempts: Array<{ failureClass: StructuralFailureClass; transient: boolean }>;
  minimumStructuralEvidence: number;
}): StructuralFailureClass | undefined {
  const structural = input.attempts.filter((attempt) => !attempt.transient && attempt.failureClass === "structural_site_change");
  if (structural.length >= input.minimumStructuralEvidence) return "structural_site_change";
  const latest = input.attempts.at(-1);
  if (!latest) return undefined;
  if (!latest.transient && latest.failureClass === "structural_site_change") return undefined;
  return latest.failureClass;
}

function reserveBudget(remaining: AgentRunBudgetLimits, requested: Partial<AgentRunBudgetLimits>): boolean {
  for (const [key, value] of Object.entries(requested) as [keyof AgentRunBudgetLimits, number][]) {
    if (value > remaining[key]) return false;
  }
  for (const [key, value] of Object.entries(requested) as [keyof AgentRunBudgetLimits, number][]) {
    remaining[key] -= value;
  }
  return true;
}

function workflowPageState(observation: ObservationEnvelope | undefined): AgentPageState | undefined {
  const value = observation?.modelRepresentation;
  if (!value || typeof value !== "object") return undefined;
  if (typeof (value as AgentPageState).url !== "string") return undefined;
  if (!Array.isArray((value as AgentPageState).relevantControls)) return undefined;
  return value as AgentPageState;
}

function buildDiscoveryEvidence(run: AgentRun, observations: ObservationEnvelope[], accepted: AcquiredContent[]): SourceDiscoveryEvidence {
  const pageStates = observations
    .map((observation) => ({ observation, pageState: workflowPageState(observation) }))
    .filter((entry): entry is { observation: ObservationEnvelope; pageState: AgentPageState } => Boolean(entry.pageState));
  const listingUrlCandidates = unique(pageStates
    .filter(({ pageState }) => pageState.pageType === "listing")
    .map(({ pageState }) => pageState.url));
  const stoppingWatermarkEvidence = pageStates
    .filter(({ pageState }) => pageState.pagination.watermarkObserved || pageState.pagination.exhausted)
    .map(({ observation, pageState }) => ({
      observationId: observation.id,
      url: pageState.url,
      watermarkObserved: pageState.pagination.watermarkObserved,
      exhausted: pageState.pagination.exhausted
    }));
  const locatorEvidence = pageStates.flatMap(({ observation, pageState }) =>
    pageState.relevantControls.map((control) => ({
      observationId: observation.id,
      kind: control.kind,
      label: control.label,
      destinationUrl: control.destinationUrl,
      safeAction: control.safeAction,
      capability: readCapability(control.interactionCapability)
    }))
  );
  return {
    canonicalResourceIdentity: {
      resourceId: run.resourceId,
      candidateCanonicalUrl: run.candidate.canonicalUrl,
      publisherId: run.candidate.publisherId
    },
    listingUrlCandidates,
    paginationBehavior: {
      watermarkObserved: stoppingWatermarkEvidence.some((entry) => entry.watermarkObserved),
      exhausted: stoppingWatermarkEvidence.some((entry) => entry.exhausted),
      evidenceObservationIds: stoppingWatermarkEvidence.map((entry) => entry.observationId)
    },
    articleUrlPatterns: unique([
      pathPattern(run.candidate.canonicalUrl),
      ...accepted.map((content) => pathPattern(content.canonicalUrl)),
      ...pageStates
        .flatMap(({ pageState }) => pageState.relevantControls)
        .map((control) => control.destinationUrl)
        .filter((value): value is string => Boolean(value))
        .map(pathPattern)
    ]),
    publicationTimeEvidence: [
      ...accepted.map((content) => ({
        observationId: content.observationId,
        publisherTimestamp: content.publisherTimestamp
      })),
      ...pageStates
      .filter(({ pageState }) => Boolean(pageState.article?.publisherTimestamp))
      .map(({ observation, pageState }) => ({
        observationId: observation.id,
        publisherTimestamp: pageState.article!.publisherTimestamp!
      }))
    ],
    pageTypeObservations: [
      ...accepted.map((content) => ({
        observationId: content.observationId,
        url: content.canonicalUrl,
        pageType: "article" as const,
        title: content.title
      })),
      ...pageStates.map(({ observation, pageState }) => ({
      observationId: observation.id,
      url: pageState.url,
      pageType: pageState.pageType,
      title: pageState.title
      }))
    ],
    locatorEvidence,
    requiredReadCapabilities: unique(locatorEvidence
      .map((entry) => entry.capability)
      .filter((value): value is InteractionCapability["actionClass"] => Boolean(value))),
    stoppingWatermarkEvidence
  };
}

function pathPattern(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/[0-9]{4}(?:\/[0-9]{2})?(?:\/[0-9]{2})?/g, "{date}").replace(/\/[^/]+$/, "/{slug}")}`;
  } catch {
    return value;
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function readCapability(value: string | undefined): InteractionCapability["actionClass"] | undefined {
  return value === "follow_read_link" || value === "visual_read_link" || value === "pointer_only" ? value : undefined;
}

function workflowIdentity(candidate: WorkflowCandidate) {
  return {
    id: candidate.id,
    tenantId: candidate.tenantId,
    resourceId: candidate.resourceId,
    sourceCaptureId: candidate.sourceCaptureId,
    candidate: candidate.candidate,
    operations: candidate.operations,
    version: candidate.version
  };
}

function captureIdentity(bundle: WorkflowCaptureBundle) {
  return {
    id: bundle.id,
    runId: bundle.runId,
    tenantId: bundle.tenantId,
    resourceId: bundle.resourceId,
    candidate: bundle.candidate,
    actions: bundle.actions,
    observationIds: bundle.observationIds,
    acceptedContentId: bundle.acceptedContentId,
    successfulAlternatives: bundle.successfulAlternatives,
    failedAlternatives: bundle.failedAlternatives,
    discoveryEvidence: bundle.discoveryEvidence,
    extractionEvidence: bundle.extractionEvidence,
    completionEvidence: bundle.completionEvidence,
    runtime: bundle.runtime
  };
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
