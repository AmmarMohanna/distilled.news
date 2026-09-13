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
  promoteWorkflow(workflowId: string, validatorId: string, now?: string): Promise<WorkflowCandidate>;
  markWorkflow(workflowId: string, state: Extract<WorkflowLifecycleState, "REJECTED" | "INVALID" | "ROLLED_BACK">, now?: string): Promise<WorkflowCandidate>;
}

export class MemoryWorkflowRepository implements WorkflowRepository {
  private readonly captures = new Map<string, WorkflowCaptureBundle>();
  private readonly workflows = new Map<string, WorkflowCandidate>();
  private readonly validations = new Map<string, WorkflowValidationResult>();

  async saveCaptureBundle(bundle: WorkflowCaptureBundle): Promise<void> {
    const existing = this.captures.get(bundle.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(bundle)) throw new Error("workflow capture identity collision");
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
    return bundle;
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
    const criteria = {
      hasOperations: candidate.operations.length > 0,
      hasNoUnsupportedGaps: candidate.unsupportedGaps.length === 0,
      candidateIdentityMatches: candidate.candidate.candidateId === evidence.candidate.candidateId &&
        candidate.candidate.canonicalUrl === evidence.candidate.canonicalUrl,
      hasSuccessfulExtractionEvidence: evidence.extractionEvidence.some((entry) => entry.canonicalUrl === candidate.candidate.canonicalUrl),
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
  return input.attempts.at(-1)?.failureClass;
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

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}
