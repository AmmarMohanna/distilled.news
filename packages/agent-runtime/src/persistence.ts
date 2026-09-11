import type {
  AcquiredContent,
  AgentCheckpoint,
  AgentModelCall,
  AgentModelCallAttempt,
  AgentOutbox,
  AgentPolicyDecision,
  AgentRun,
  AgentRunAttempt,
  AgentRunBudget,
  AgentRunEvent,
  AgentRunLease,
  AgentRunState,
  AgentToolCall,
  AgentToolIntent,
  AgentToolResult,
  AgentTurn,
  BrowserContextRecord,
  BrowserSessionRecord,
  ChallengeRecord,
  CompletionAcceptance,
  CompletionProposal,
  ObservationEnvelope
} from "./contracts";
import type { RunConfigurationSnapshot } from "./contracts";
import { makeId } from "./contracts";
import { transitionRun, transitionToolCall, transitionTurn } from "./state-machine";

export class StaleGenerationError extends Error {
  constructor(runId: string, expected: number, actual: number) {
    super(`stale generation for ${runId}: expected ${expected}, current ${actual}`);
    this.name = "StaleGenerationError";
  }
}

export interface AdmitRunInput {
  run: AgentRun;
  budget: AgentRunBudget;
  outbox: AgentOutbox;
  configuration: RunConfigurationSnapshot;
}

export interface RuntimeStore {
  admitRun(input: AdmitRunInput): Promise<{ run: AgentRun; outbox: AgentOutbox; created: boolean }>;
  getRun(runId: string): Promise<AgentRun | null>;
  getRunByIdempotencyKey(key: string): Promise<AgentRun | null>;
  getRunConfiguration(runId: string): Promise<RunConfigurationSnapshot | null>;
  getNextTurnSequence(runId: string): Promise<number>;
  acquireLease(runId: string, workerId: string, ttlMs: number, now?: Date): Promise<AgentRunLease | null>;
  assertGeneration(runId: string, generation: number): Promise<void>;
  saveRunAttempt(value: AgentRunAttempt): Promise<void>;
  transitionRun(runId: string, generation: number, to: AgentRunState, at?: string): Promise<AgentRun>;
  saveTurn(value: AgentTurn): Promise<void>;
  getTurn(turnId: string): Promise<AgentTurn | null>;
  transitionTurn(turnId: string, to: AgentTurn["state"]): Promise<void>;
  saveModelCall(value: AgentModelCall): Promise<void>;
  transitionModelCall(modelCallId: string, state: AgentModelCall["state"], generation: number): Promise<void>;
  saveModelAttempt(value: AgentModelCallAttempt): Promise<void>;
  saveToolCall(value: AgentToolCall): Promise<void>;
  getToolCall(toolCallId: string): Promise<AgentToolCall | null>;
  listUnsettledToolCalls(runId: string): Promise<AgentToolCall[]>;
  transitionToolCall(toolCallId: string, to: AgentToolCall["state"], generation: number): Promise<void>;
  savePolicyDecision(value: AgentPolicyDecision): Promise<void>;
  saveToolIntent(value: AgentToolIntent): Promise<void>;
  saveToolResult(value: AgentToolResult): Promise<AgentToolResult>;
  getToolIntent(toolCallId: string): Promise<AgentToolIntent | null>;
  getToolResult(toolCallId: string): Promise<AgentToolResult | null>;
  saveObservation(value: ObservationEnvelope): Promise<void>;
  saveCheckpoint(value: AgentCheckpoint): Promise<void>;
  getCheckpoint(runId: string): Promise<AgentCheckpoint | null>;
  saveChallenge(value: ChallengeRecord): Promise<void>;
  getChallengeOccurrence(runId: string, fingerprint: string): Promise<number>;
  saveCompletionProposal(value: CompletionProposal): Promise<void>;
  saveCompletionAcceptance(value: CompletionAcceptance): Promise<void>;
  acceptContent(value: AcquiredContent): Promise<AcquiredContent>;
  getAcceptedContent(runId: string): Promise<AcquiredContent[]>;
  saveBrowserSession(value: BrowserSessionRecord): Promise<void>;
  saveBrowserContext(value: BrowserContextRecord): Promise<void>;
  appendEvent(runId: string, type: string, data: unknown, at?: string): Promise<AgentRunEvent>;
  listEvents(runId: string): Promise<AgentRunEvent[]>;
  markOutboxDelivered(runId: string, at?: string): Promise<void>;
  acknowledgeOutbox(runId: string, at?: string): Promise<void>;
  getOutbox(runId: string): Promise<AgentOutbox | null>;
  getBudget(runId: string): Promise<AgentRunBudget | null>;
  saveBudget(value: AgentRunBudget): Promise<void>;
  latestObservation(runId: string): Promise<ObservationEnvelope | null>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryRuntimeStore implements RuntimeStore {
  private readonly runs = new Map<string, AgentRun>();
  private readonly idempotency = new Map<string, string>();
  private readonly leases = new Map<string, AgentRunLease>();
  private readonly attempts = new Map<string, AgentRunAttempt>();
  private readonly turns = new Map<string, AgentTurn>();
  private readonly modelCalls = new Map<string, AgentModelCall>();
  private readonly modelAttempts = new Map<string, AgentModelCallAttempt>();
  private readonly toolCalls = new Map<string, AgentToolCall>();
  private readonly policyDecisions = new Map<string, AgentPolicyDecision>();
  private readonly intents = new Map<string, AgentToolIntent>();
  private readonly results = new Map<string, AgentToolResult>();
  private readonly observations = new Map<string, ObservationEnvelope>();
  private readonly observationOrder = new Map<string, string[]>();
  private readonly checkpoints = new Map<string, AgentCheckpoint>();
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly proposals = new Map<string, CompletionProposal>();
  private readonly acceptances = new Map<string, CompletionAcceptance>();
  private readonly contents = new Map<string, AcquiredContent>();
  private readonly contentByRun = new Map<string, string[]>();
  private readonly browserSessions = new Map<string, BrowserSessionRecord>();
  private readonly browserContexts = new Map<string, BrowserContextRecord>();
  private readonly events = new Map<string, AgentRunEvent[]>();
  private readonly outboxes = new Map<string, AgentOutbox>();
  private readonly budgets = new Map<string, AgentRunBudget>();
  private readonly configurations = new Map<string, RunConfigurationSnapshot>();

  async admitRun(input: AdmitRunInput) {
    const existingId = this.idempotency.get(input.run.idempotencyKey);
    if (existingId) {
      return {
        run: clone(this.runs.get(existingId)!),
        outbox: clone(this.outboxes.get(existingId)!),
        created: false
      };
    }
    this.runs.set(input.run.runId, clone(input.run));
    this.idempotency.set(input.run.idempotencyKey, input.run.runId);
    this.outboxes.set(input.run.runId, clone(input.outbox));
    this.budgets.set(input.run.runId, clone(input.budget));
    this.configurations.set(input.run.runId, clone(input.configuration));
    await this.appendEvent(input.run.runId,"agent.run.admitted",{
      tenantId:input.run.tenantId,resourceId:input.run.resourceId,objective:input.run.objective,mode:input.run.mode,
      state:input.run.state,policySnapshotId:input.run.policySnapshotId,completionContractVersion:input.run.completionContractVersion
    },input.run.createdAt);
    await this.appendEvent(input.run.runId, "agent.outbox.created", { outboxId: input.outbox.id }, input.outbox.createdAt);
    return { run: clone(input.run), outbox: clone(input.outbox), created: true };
  }

  async getRun(runId: string) {
    return clone(this.runs.get(runId) ?? null);
  }

  async getRunByIdempotencyKey(key: string) {
    const id = this.idempotency.get(key);
    return id ? this.getRun(id) : null;
  }

  async getRunConfiguration(runId: string) {
    return clone(this.configurations.get(runId) ?? null);
  }

  async getNextTurnSequence(runId: string) {
    return Math.max(0, ...[...this.turns.values()].filter((turn) => turn.runId === runId).map((turn) => turn.sequence)) + 1;
  }

  async acquireLease(runId: string, workerId: string, ttlMs: number, now = new Date()) {
    const run = this.requireRun(runId);
    const current = this.leases.get(runId);
    if (current && new Date(current.expiresAt).getTime() > now.getTime()) return null;
    run.generation += 1;
    run.updatedAt = now.toISOString();
    const lease: AgentRunLease = {
      runId,
      generation: run.generation,
      workerId,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString()
    };
    this.leases.set(runId, lease);
    await this.appendEvent(runId, "agent.lease.acquired", lease, now.toISOString());
    return clone(lease);
  }

  async assertGeneration(runId: string, generation: number) {
    const actual = this.requireRun(runId).generation;
    if (actual !== generation) throw new StaleGenerationError(runId, generation, actual);
  }

  async saveRunAttempt(value: AgentRunAttempt) {
    await this.assertGeneration(value.runId, value.generation);
    this.attempts.set(value.id, clone(value));
    await this.appendEvent(value.runId, value.completedAt ? "agent.run.attempt_completed" : "agent.run.attempt_started", value, value.completedAt ?? value.startedAt);
  }

  async transitionRun(runId: string, generation: number, to: AgentRunState, at = new Date().toISOString()) {
    await this.assertGeneration(runId, generation);
    const run = this.requireRun(runId);
    run.state = transitionRun(run.state, to);
    run.updatedAt = at;
    await this.appendEvent(runId, "agent.run.state_changed", { state: to, generation }, at);
    return clone(run);
  }

  async saveTurn(value: AgentTurn) {
    this.turns.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.turn.created", value, value.createdAt);
  }

  async getTurn(turnId: string) {
    return clone(this.turns.get(turnId) ?? null);
  }

  async transitionTurn(turnId: string, to: AgentTurn["state"]) {
    const turn = this.turns.get(turnId);
    if (!turn) throw new Error(`turn not found: ${turnId}`);
    turn.state = transitionTurn(turn.state, to);
    await this.appendEvent(turn.runId, "agent.turn.state_changed", { turnId, state: to });
  }

  async saveModelCall(value: AgentModelCall) {
    await this.assertGeneration(value.runId,value.generation);
    this.modelCalls.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.model.call_created", value, value.createdAt);
  }

  async transitionModelCall(modelCallId: string, state: AgentModelCall["state"], generation: number) {
    const call = this.modelCalls.get(modelCallId);
    if (!call) throw new Error(`model call not found: ${modelCallId}`);
    await this.assertGeneration(call.runId,generation);
    call.state = state;
    await this.appendEvent(call.runId,"agent.model.state_changed",{modelCallId,state});
  }

  async saveModelAttempt(value: AgentModelCallAttempt) {
    const call = this.modelCalls.get(value.modelCallId);
    if (!call) throw new Error(`model call not found: ${value.modelCallId}`);
    await this.assertGeneration(call.runId,call.generation);
    this.modelAttempts.set(value.id, clone(value));
    await this.appendEvent(call.runId, `agent.model.attempt_${value.state}`, value);
  }

  async saveToolCall(value: AgentToolCall) {
    if (this.toolCalls.has(value.id)) return;
    this.toolCalls.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.tool.requested", value, value.createdAt);
  }

  async getToolCall(toolCallId: string) {
    return clone(this.toolCalls.get(toolCallId) ?? null);
  }

  async listUnsettledToolCalls(runId: string) {
    const terminal = new Set(["policy_denied", "succeeded", "failed", "cancelled", "effect_unknown"]);
    return [...this.toolCalls.values()].filter((call) => call.runId === runId && !terminal.has(call.state)).map(clone);
  }

  async transitionToolCall(toolCallId: string, to: AgentToolCall["state"], generation: number) {
    const call = this.toolCalls.get(toolCallId);
    if (!call) throw new Error(`tool call not found: ${toolCallId}`);
    await this.assertGeneration(call.runId, generation);
    call.state = transitionToolCall(call.state, to);
    await this.appendEvent(call.runId, `agent.tool.${to}`, { toolCallId, tool: call.tool });
  }

  async savePolicyDecision(value: AgentPolicyDecision) {
    this.policyDecisions.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.policy.decision", value, value.evaluatedAt);
  }

  async saveToolIntent(value: AgentToolIntent) {
    if (this.intents.has(value.toolCallId)) return;
    await this.assertGeneration(value.runId, value.generation);
    this.intents.set(value.toolCallId, clone(value));
    await this.appendEvent(value.runId, "agent.tool.intent_persisted", value, value.persistedAt);
  }

  async saveToolResult(value: AgentToolResult) {
    await this.assertGeneration(value.runId, value.generation);
    const existing = this.results.get(value.toolCallId);
    if (existing) return clone(existing);
    this.results.set(value.toolCallId, clone(value));
    await this.appendEvent(value.runId, "agent.tool.result_recorded", value, value.completedAt);
    return clone(value);
  }

  async getToolIntent(toolCallId: string) {
    return clone(this.intents.get(toolCallId) ?? null);
  }

  async getToolResult(toolCallId: string) {
    return clone(this.results.get(toolCallId) ?? null);
  }

  async saveObservation(value: ObservationEnvelope) {
    await this.assertGeneration(value.runId, value.browserGeneration);
    if (this.observations.has(value.id)) return;
    this.observations.set(value.id, clone(value));
    const ids = this.observationOrder.get(value.runId) ?? [];
    ids.push(value.id);
    this.observationOrder.set(value.runId, ids);
    await this.appendEvent(value.runId, "agent.observation.persisted", {
      observationId: value.id,
      trustClassification: value.trustClassification,
      representationType: value.representationType,
      rawHash: value.raw.hash,
      presentedHash: value.presented.hash
    }, value.retrievedAt);
  }

  async latestObservation(runId: string) {
    const ids = this.observationOrder.get(runId) ?? [];
    return clone(ids.length ? this.observations.get(ids[ids.length - 1])! : null);
  }

  async saveCheckpoint(value: AgentCheckpoint) {
    await this.assertGeneration(value.runId, value.generation);
    this.checkpoints.set(value.runId, clone(value));
    await this.appendEvent(value.runId, "agent.checkpoint.saved", value, value.createdAt);
  }

  async getCheckpoint(runId: string) {
    return clone(this.checkpoints.get(runId) ?? null);
  }

  async saveChallenge(value: ChallengeRecord) {
    this.challenges.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.challenge.classified", value, value.createdAt);
  }

  async getChallengeOccurrence(runId: string, fingerprint: string) {
    return Math.max(0, ...[...this.challenges.values()]
      .filter((value) => value.runId === runId && value.fingerprint === fingerprint)
      .map((value) => value.occurrence));
  }

  async saveCompletionProposal(value: CompletionProposal) {
    this.proposals.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.completion.proposed", value, value.proposedAt);
  }

  async saveCompletionAcceptance(value: CompletionAcceptance) {
    this.acceptances.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.completion.verifier_decided", value, value.decidedAt);
  }

  async acceptContent(value: AcquiredContent) {
    await this.assertGeneration(value.runId, value.generation);
    const existing = this.contents.get(value.acceptanceId);
    if (existing) return clone(existing);
    this.contents.set(value.acceptanceId, clone(value));
    const ids = this.contentByRun.get(value.runId) ?? [];
    ids.push(value.acceptanceId);
    this.contentByRun.set(value.runId, ids);
    await this.appendEvent(value.runId, "agent.acquired_content.accepted", value, value.acceptedAt);
    return clone(value);
  }

  async getAcceptedContent(runId: string) {
    return (this.contentByRun.get(runId) ?? []).map((id) => clone(this.contents.get(id)!));
  }

  async saveBrowserSession(value: BrowserSessionRecord) {
    await this.assertGeneration(value.runId,value.generation);
    this.browserSessions.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.browser.session_saved", value, value.createdAt);
  }

  async saveBrowserContext(value: BrowserContextRecord) {
    await this.assertGeneration(value.runId,value.generation);
    this.browserContexts.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.browser.context_saved", value, value.createdAt);
  }

  async appendEvent(runId: string, type: string, data: unknown, at = new Date().toISOString()) {
    const events = this.events.get(runId) ?? [];
    const event: AgentRunEvent = {
      id: makeId("event", runId, events.length + 1, type),
      runId,
      sequence: events.length + 1,
      type,
      data: clone(data),
      createdAt: at
    };
    events.push(event);
    this.events.set(runId, events);
    return clone(event);
  }

  async listEvents(runId: string) {
    return clone(this.events.get(runId) ?? []);
  }

  async acknowledgeOutbox(runId: string, at = new Date().toISOString()) {
    const outbox = this.outboxes.get(runId);
    if (!outbox) throw new Error(`outbox not found: ${runId}`);
    outbox.state = "acknowledged";
    outbox.acknowledgedAt = at;
    await this.appendEvent(runId, "agent.outbox.acknowledged", { outboxId: outbox.id }, at);
  }

  async markOutboxDelivered(runId: string, at = new Date().toISOString()) {
    const outbox = this.outboxes.get(runId);
    if (!outbox) throw new Error(`outbox not found: ${runId}`);
    if (outbox.state === "pending") outbox.state = "delivered";
    await this.appendEvent(runId,"agent.outbox.delivered",{outboxId:outbox.id},at);
  }

  async getOutbox(runId: string) {
    return clone(this.outboxes.get(runId) ?? null);
  }

  async getBudget(runId: string) {
    return clone(this.budgets.get(runId) ?? null);
  }

  async saveBudget(value: AgentRunBudget) {
    this.budgets.set(value.runId, clone(value));
    await this.appendEvent(value.runId, "agent.budget.updated", value.usage);
  }

  private requireRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    return run;
  }
}
