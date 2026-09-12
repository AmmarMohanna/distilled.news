import { createHash } from "node:crypto";

export const MODEL_ROLES = [
  "NAVIGATION_FAST",
  "EXTRACTION_FAST",
  "VISION_FAST",
  "REASONING_STANDARD",
  "REASONING_STRONG",
  "VISION_STRONG",
  "ADAPTER_REPAIR",
  "SEMANTIC_VERIFIER"
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

export type AgentRunState =
  | "admitted"
  | "queued"
  | "running"
  | "waiting_human"
  | "suspended"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTurnState =
  | "created"
  | "model_pending"
  | "model_streaming"
  | "response_validating"
  | "tools_pending"
  | "tools_running"
  | "results_recorded"
  | "continuation_pending"
  | "completion_proposed"
  | "completed"
  | "failed"
  | "cancelled"
  | "effect_unknown";

export type ToolCallState =
  | "requested"
  | "schema_validated"
  | "policy_allowed"
  | "policy_denied"
  | "budget_reserved"
  | "intent_persisted"
  | "dispatching"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "effect_unknown";

export type ChallengeState =
  | "NO_CHALLENGE"
  | "PASSIVE_BROWSER_CHALLENGE"
  | "LOGIN_REQUIRED"
  | "SESSION_EXPIRED"
  | "MFA_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "AUTOMATION_BLOCKED"
  | "ACCESS_DENIED"
  | "CHALLENGE_LOOP";

export type EffectCertainty = "not_dispatched" | "known_applied" | "known_not_applied" | "unknown";

export interface RuntimeIds {
  runId: string;
  tenantId: string;
  resourceId: string;
}

export interface AgentRun extends RuntimeIds {
  idempotencyKey: string;
  objective: string;
  mode: "known_candidate" | "discovery";
  state: AgentRunState;
  generation: number;
  policySnapshotId: string;
  completionContractVersion: string;
  createdAt: string;
  updatedAt: string;
  candidate: CandidateIdentity;
}

export interface CandidateIdentity {
  candidateId: string;
  canonicalUrl: string;
  publisherId: string;
  acquisitionAttempt: string;
}

export interface AgentRunAttempt {
  id: string;
  runId: string;
  generation: number;
  workerId: string;
  startedAt: string;
  completedAt?: string;
  outcome?: "completed" | "failed" | "superseded" | "suspended";
}

export interface AgentRunLease {
  runId: string;
  generation: number;
  workerId: string;
  expiresAt: string;
}

export interface AgentTurn {
  id: string;
  runId: string;
  sequence: number;
  state: AgentTurnState;
  pageStateHash?: string;
  createdAt: string;
  generation: number;
}

export interface ModelCapability {
  modelRef: string;
  provider: string;
  toolCalling: boolean;
  vision: boolean;
  structuredOutput: boolean;
  reasoningClass: "fast" | "standard" | "strong";
  enabled: boolean;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  deployment: ModelDeployment;
  externallyHosted: boolean;
  privacyEligibility: string[];
  retentionClass: "zero_data_retention" | "limited" | "standard";
  residency?: string;
}

export type LlmDeploymentMode = "api" | "self_hosted" | "hybrid";
export type ModelDeployment = "api" | "self_hosted";

export interface ModelTargetConfig {
  deployment: ModelDeployment;
  model: string;
}

export interface ModelRoleRouteConfig {
  primary: ModelTargetConfig;
  fallbacks: ModelTargetConfig[];
}

export interface ModelRoutingConfig {
  mode: LlmDeploymentMode;
  apiGateway: string;
  selfHostedGateway: string;
  roles: Partial<Record<ModelRole, ModelRoleRouteConfig>>;
}

export interface RunConfigurationSnapshot {
  runId: string;
  candidate: CandidateIdentity;
  policy: {
    id: string;
    allowedOrigins: string[];
    allowedTools: ToolName[];
    allowLoopback: boolean;
    visualReadPurposes: string[];
    modelPolicy: ModelPolicy;
  };
  modelRouting: ModelRoutingConfig;
  modelCapabilities: ModelCapability[];
  createdAt: string;
}

export interface ModelPolicy {
  allowedProviders: string[];
  allowedDeployments: ModelDeployment[];
  requiredPrivacyEligibility: string[];
  allowedRetentionClasses: ModelCapability["retentionClass"][];
  allowedResidencies?: string[];
}

export interface ModelRoute {
  role: ModelRole;
  routingReason: string;
  requiredCapabilities: string[];
  configuredChain: string[];
  configuredTargets: ModelTargetConfig[];
  deployment: ModelDeployment;
  gateway: string;
  selectedModel: string;
  selectedProvider: string;
  selectedCapability: ModelCapability;
  appliedPolicyConstraints: string[];
  fallbackReason?: string;
}

export interface AgentModelCall {
  id: string;
  runId: string;
  turnId: string;
  generation: number;
  role: ModelRole;
  route: ModelRoute;
  contextManifestHash: string;
  stableInstructionsHash: string;
  state: "created" | "streaming" | "completed" | "failed";
  createdAt: string;
}

export interface AgentModelCallAttempt {
  id: string;
  modelCallId: string;
  attempt: number;
  requestedGateway: string;
  actualGateway?: string;
  requestedDeployment: ModelDeployment;
  actualDeployment?: ModelDeployment;
  requestedModel: string;
  actualModel?: string;
  requestedProvider: string;
  actualProvider?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  fallbackReason?: string;
  state: "started" | "completed" | "failed";
  reservation?: { inputTokens:number; outputTokens:number; costUsd:number };
}

export const TOOL_NAMES = [
  "browser.navigate@1",
  "browser.inspect_dom@1",
  "browser.inspect_accessibility_tree@1",
  "browser.follow_link@1",
  "browser.extract@1",
  "browser.query_page_state@1",
  "browser.scroll@1",
  "computer.screenshot@1",
  "computer.move_pointer@1",
  "computer.click@1",
  "run.propose_completion@1",
  "fixture.publish@1"
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface PlannedAction {
  tool: ToolName;
  arguments: unknown;
  expected?: {
    pageRevision?: string;
    urlIncludes?: string;
    challengeState?: ChallengeState;
  };
}

export interface BoundedActionPlan {
  version: 1;
  actions: PlannedAction[];
  rationale?: string;
}

export interface AgentToolCall {
  id: string;
  runId: string;
  turnId: string;
  modelCallId: string;
  planIndex: number;
  tool: ToolName;
  arguments: unknown;
  state: ToolCallState;
  createdAt: string;
  generation: number;
}

export interface AgentPolicyDecision {
  id: string;
  runId: string;
  toolCallId: string;
  allowed: boolean;
  reasonCode: string;
  policySnapshotId: string;
  evaluatedAt: string;
  generation: number;
}

export interface AgentToolIntent {
  id: string;
  runId: string;
  toolCallId: string;
  idempotencyKey: string;
  generation: number;
  tool: ToolName;
  arguments: unknown;
  persistedAt: string;
}

export interface InteractionGroundingRecord {
  id: string;
  runId: string;
  toolCallId: string;
  generation: number;
  observationId: string;
  observationHash: string;
  pageRevision: string;
  actionClass: InteractionCapability["actionClass"];
  effect: InteractionCapability["effect"];
  target: InteractionCapability["target"];
  createdAt: string;
}

export interface AgentToolResult {
  id: string;
  runId: string;
  toolCallId: string;
  generation: number;
  state: Extract<ToolCallState, "succeeded" | "failed" | "cancelled" | "effect_unknown">;
  effectCertainty: EffectCertainty;
  output?: unknown;
  errorCode?: string;
  errorMessage?: string;
  completedAt: string;
}

export interface AgentCheckpoint {
  id: string;
  runId: string;
  generation: number;
  runState: AgentRunState;
  lastTurnId?: string;
  lastToolCallId?: string;
  latestObservationId?: string;
  challengeState: ChallengeState;
  progress: ProgressFacts;
  budget: AgentRunBudgetUsage;
  createdAt: string;
}

export interface AgentRunBudgetLimits {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  modelCostUsd: number;
  strongModelCalls: number;
  visionCalls: number;
  browserActions: number;
  navigations: number;
  downloads: number;
  retries: number;
  challengeTransitions: number;
  pages: number;
  childAgents: number;
  wallClockMs: number;
}

export type AgentRunBudgetUsage = AgentRunBudgetLimits;

export interface AgentRunBudget {
  runId: string;
  limits: AgentRunBudgetLimits;
  usage: AgentRunBudgetUsage;
  startedAt: string;
}

export interface AgentRunEvent {
  id: string;
  runId: string;
  sequence: number;
  type: string;
  data: unknown;
  createdAt: string;
}

export interface AgentOutbox {
  id: string;
  runId: string;
  kind: "agent_run_wake";
  state: "pending" | "delivered" | "acknowledged" | "failed";
  createdAt: string;
  acknowledgedAt?: string;
  deliveredAt?: string;
  attempts: number;
  nextAttemptAt: string;
  failedAt?: string;
  failureReason?: string;
}

export interface BrowserSessionRecord {
  id: string;
  runId: string;
  tenantId: string;
  generation: number;
  state: "provisioning" | "ready" | "active" | "closed" | "crashed";
  createdAt: string;
}

export interface BrowserContextRecord {
  id: string;
  browserSessionId: string;
  runId: string;
  tenantId: string;
  generation: number;
  activePageId: string;
  createdAt: string;
}

export interface ArtifactReference {
  ref: string;
  hash: string;
  size: number;
}

export interface ObservationEnvelope {
  id: string;
  runId: string;
  turnId: string;
  toolCallId: string;
  browserSessionId: string;
  browserGeneration: number;
  pageId: string;
  pageRevision: string;
  originUrl: string;
  originDomain: string;
  finalUrl?: string;
  retrievedAt: string;
  contentType: string;
  trustClassification: "UNTRUSTED_EXTERNAL";
  representationType: "dom" | "accessibility" | "page_state" | "screenshot" | "article" | "challenge" | "delta";
  raw: ArtifactReference;
  presented: ArtifactReference;
  originalSize: number;
  presentedSize: number;
  truncated: boolean;
  transformationVersion: string;
  redactions: string[];
  modelRepresentation: unknown;
}

export interface SemanticControl {
  handle: string;
  kind: "link" | "button" | "input" | "other";
  label: string;
  safeAction: "follow" | "read" | "forbidden" | "unknown";
  destinationUrl?: string;
  interactionCapability?: string;
}

export interface InteractionCapability {
  token: string;
  tenantId: string;
  runId: string;
  browserGeneration: number;
  pageId: string;
  observationId: string;
  observationHash: string;
  pageRevision: string;
  actionClass: "follow_read_link" | "visual_read_link" | "pointer_only";
  effect: "read_navigation" | "pointer_only";
  target:
    | { kind: "element"; handle: string; destinationUrl: string }
    | { kind: "coordinates"; x: number; y: number; destinationUrl?: string };
  viewport?: { width: number; height: number; deviceScaleFactor: number };
  expiresAt: string;
}

export interface AgentPageState {
  url: string;
  title: string;
  pageType: "listing" | "article" | "challenge" | "unknown";
  pageRevision: string;
  relevantControls: SemanticControl[];
  article?: {
    title?: string;
    canonicalUrl?: string;
    publisherTimestamp?: string;
    contentHash?: string;
  };
  pagination: {
    watermarkObserved: boolean;
    exhausted: boolean;
  };
  challengeState: ChallengeState;
  progress: ProgressFacts;
  remainingBudget: AgentRunBudgetLimits;
  policyVisibleCapabilities: ToolName[];
}

export interface ObservationDelta {
  fromObservationId: string;
  toObservationId: string;
  changed: Partial<AgentPageState>;
  removedControls: string[];
  addedControls: SemanticControl[];
}

export interface ChallengeRecord {
  id: string;
  runId: string;
  observationId: string;
  state: ChallengeState;
  fingerprint: string;
  occurrence: number;
  disposition: "continue" | "suspend" | "fail" | "route_switch_required";
  createdAt: string;
  generation: number;
}

export interface ProgressFacts {
  watermarkObserved: boolean;
  validatedListingBoundaryReached: boolean;
  articleExtracted: boolean;
  acceptedContentId?: string;
  acceptedObservationId?: string;
  acceptedCandidateId?: string;
  expectedCandidateId?: string;
}

export interface CompletionProposal {
  id: string;
  runId: string;
  toolCallId: string;
  citedObservationIds: string[];
  proposedAt: string;
  generation: number;
}

export interface CompletionAcceptance {
  id: string;
  runId: string;
  proposalId: string;
  contractVersion: string;
  outcome: "accepted" | "not_satisfied" | "indeterminate";
  deficits: string[];
  decidedAt: string;
  generation: number;
}

export interface AcquiredContent {
  acceptanceId: string;
  runId: string;
  tenantId: string;
  resourceId: string;
  candidateId: string;
  acquisitionAttempt: string;
  generation: number;
  turnId: string;
  modelCallId: string;
  toolCallId: string;
  observationId: string;
  rawArtifactRef: string;
  canonicalUrl: string;
  finalUrl: string;
  publisherTimestamp: string;
  title: string;
  excerpt: string;
  body: string;
  contentHash: string;
  acceptedAt: string;
}

export type CanonicalAcquiredContent = Pick<AcquiredContent,
  "acceptanceId"|"tenantId"|"resourceId"|"candidateId"|"canonicalUrl"|"publisherTimestamp"|
  "title"|"excerpt"|"body"|"contentHash"
>;

export type AgentRunAcquisitionProvenance = Pick<AcquiredContent,
  "runId"|"acquisitionAttempt"|"generation"|"turnId"|"modelCallId"|"toolCallId"|
  "observationId"|"rawArtifactRef"|"finalUrl"|"acceptedAt"
>;

export interface CandidateProposal {
  id: string;
  runId: string;
  url: string;
  evidenceObservationIds: string[];
}

export function makeId(prefix: string, ...parts: Array<string | number>): string {
  const encoded = [prefix, ...parts.map(String)]
    .map((part) => `${new TextEncoder().encode(part).byteLength}:${part}`)
    .join("|");
  return `${prefix}_${createHash("sha256").update(encoded, "utf8").digest("hex").slice(0, 32)}`;
}

export function emptyBudgetUsage(): AgentRunBudgetUsage {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    modelCostUsd: 0,
    strongModelCalls: 0,
    visionCalls: 0,
    browserActions: 0,
    navigations: 0,
    downloads: 0,
    retries: 0,
    challengeTransitions: 0,
    pages: 0,
    childAgents: 0,
    wallClockMs: 0
  };
}
