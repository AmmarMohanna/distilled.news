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
  getRunByIdempotencyKey(tenantId: string, resourceId: string, key: string): Promise<AgentRun | null>;
  getRunConfiguration(runId: string): Promise<RunConfigurationSnapshot | null>;
  getNextTurnSequence(runId: string): Promise<number>;
  acquireLease(runId: string, workerId: string, ttlMs: number, now?: Date): Promise<AgentRunLease | null>;
  renewLease(runId: string, generation: number, workerId: string, ttlMs: number, now?: Date): Promise<AgentRunLease>;
  assertGeneration(runId: string, generation: number): Promise<void>;
  saveRunAttempt(value: AgentRunAttempt): Promise<void>;
  transitionRun(runId: string, generation: number, to: AgentRunState, at?: string): Promise<AgentRun>;
  saveTurn(value: AgentTurn): Promise<void>;
  getTurn(turnId: string): Promise<AgentTurn | null>;
  transitionTurn(turnId: string, to: AgentTurn["state"], generation: number): Promise<void>;
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
  appendEvent(runId: string, type: string, data: unknown, at?: string, generation?: number): Promise<AgentRunEvent>;
  listEvents(runId: string): Promise<AgentRunEvent[]>;
  markOutboxDelivered(runId: string, at?: string): Promise<void>;
  acknowledgeOutbox(runId: string, at?: string): Promise<void>;
  getOutbox(runId: string): Promise<AgentOutbox | null>;
  listPendingOutbox(limit?: number, now?: Date): Promise<AgentOutbox[]>;
  getBudget(runId: string): Promise<AgentRunBudget | null>;
  saveBudget(value: AgentRunBudget, generation: number): Promise<void>;
  authorizeChallengeResume(runId: string, challengeVersion: number, tokenHash: string, at?: string): Promise<void>;
  hasChallengeResumeAuthorization(runId: string): Promise<boolean>;
  consumeChallengeResumeAuthorization(runId: string, generation: number, at?: string): Promise<boolean>;
  latestObservation(runId: string): Promise<ObservationEnvelope | null>;
  getObservationForToolCall(toolCallId:string):Promise<ObservationEnvelope|null>;
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
  private readonly resumeAuthorizations = new Map<string,{version:number;tokenHash:string;consumedAt?:string}>();

  async admitRun(input: AdmitRunInput) {
    const scopeKey = idempotencyScope(input.run.tenantId,input.run.resourceId,input.run.idempotencyKey);
    const existingId = this.idempotency.get(scopeKey);
    if (existingId) {
      assertAdmissionIdentity(this.runs.get(existingId)!,input.run);
      assertImmutable("run configuration",pickConfigurationIdentity(this.configurations.get(existingId)!),pickConfigurationIdentity(input.configuration));
      if (JSON.stringify(this.budgets.get(existingId)?.limits)!==JSON.stringify(input.budget.limits)) throw new Error(`run budget identity collision: ${existingId}`);
      return {
        run: clone(this.runs.get(existingId)!),
        outbox: clone(this.outboxes.get(existingId)!),
        created: false
      };
    }
    const collidingRun=this.runs.get(input.run.runId);
    if (collidingRun) throw new Error(`agent run identity collision: ${input.run.runId}`);
    this.runs.set(input.run.runId, clone(input.run));
    this.idempotency.set(scopeKey, input.run.runId);
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

  async getRunByIdempotencyKey(tenantId:string,resourceId:string,key: string) {
    const id = this.idempotency.get(idempotencyScope(tenantId,resourceId,key));
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
    for (const session of this.browserSessions.values()) {
      if (session.runId === runId && session.generation < lease.generation && session.state !== "closed") session.state = "crashed";
    }
    await this.appendEvent(runId, "agent.lease.acquired", lease, now.toISOString(),lease.generation);
    return clone(lease);
  }

  async renewLease(runId:string,generation:number,workerId:string,ttlMs:number,now=new Date()) {
    const lease=this.leases.get(runId);
    if (!lease || lease.generation!==generation || lease.workerId!==workerId || new Date(lease.expiresAt).getTime()<=now.getTime()) {
      throw new StaleGenerationError(runId,generation,this.requireRun(runId).generation);
    }
    lease.expiresAt=new Date(now.getTime()+ttlMs).toISOString();
    return clone(lease);
  }

  async assertGeneration(runId: string, generation: number) {
    const actual = this.requireRun(runId).generation;
    if (actual !== generation) throw new StaleGenerationError(runId, generation, actual);
    if (generation>0) {
      const lease=this.leases.get(runId);
      if (!lease || lease.generation!==generation || new Date(lease.expiresAt).getTime()<=Date.now()) {
        throw new StaleGenerationError(runId,generation,actual);
      }
    }
  }

  async saveRunAttempt(value: AgentRunAttempt) {
    await this.assertGeneration(value.runId, value.generation);
    const existing=this.attempts.get(value.id);
    if (existing) assertImmutable("run attempt",pickRunAttemptIdentity(existing),pickRunAttemptIdentity(value));
    this.attempts.set(value.id, clone(value));
    await this.appendEvent(value.runId, value.completedAt ? "agent.run.attempt_completed" : "agent.run.attempt_started", value, value.completedAt ?? value.startedAt,value.generation);
  }

  async transitionRun(runId: string, generation: number, to: AgentRunState, at = new Date().toISOString()) {
    await this.assertGeneration(runId, generation);
    const run = this.requireRun(runId);
    run.state = transitionRun(run.state, to);
    run.updatedAt = at;
    await this.appendEvent(runId, "agent.run.state_changed", { state: to, generation }, at,generation > 0 ? generation : undefined);
    return clone(run);
  }

  async saveTurn(value: AgentTurn) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.turns.get(value.id);
    if (existing) { assertImmutable("turn",pickTurnIdentity(existing),pickTurnIdentity(value)); return; }
    this.turns.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.turn.created", value, value.createdAt,value.generation);
  }

  async getTurn(turnId: string) {
    return clone(this.turns.get(turnId) ?? null);
  }

  async transitionTurn(turnId: string, to: AgentTurn["state"],generation:number) {
    const turn = this.turns.get(turnId);
    if (!turn) throw new Error(`turn not found: ${turnId}`);
    await this.assertGeneration(turn.runId,generation);
    turn.state = transitionTurn(turn.state, to);
    await this.appendEvent(turn.runId, "agent.turn.state_changed", { turnId, state: to },undefined,generation);
  }

  async saveModelCall(value: AgentModelCall) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.modelCalls.get(value.id);
    if (existing) { assertImmutable("model call",pickModelCallIdentity(existing),pickModelCallIdentity(value)); return; }
    this.modelCalls.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.model.call_created", value, value.createdAt,value.generation);
  }

  async transitionModelCall(modelCallId: string, state: AgentModelCall["state"], generation: number) {
    const call = this.modelCalls.get(modelCallId);
    if (!call) throw new Error(`model call not found: ${modelCallId}`);
    await this.assertGeneration(call.runId,generation);
    call.state = state;
    await this.appendEvent(call.runId,"agent.model.state_changed",{modelCallId,state},undefined,generation);
  }

  async saveModelAttempt(value: AgentModelCallAttempt) {
    const call = this.modelCalls.get(value.modelCallId);
    if (!call) throw new Error(`model call not found: ${value.modelCallId}`);
    await this.assertGeneration(call.runId,call.generation);
    const existing=this.modelAttempts.get(value.id);
    if (existing) assertImmutable("model attempt",pickModelAttemptIdentity(existing),pickModelAttemptIdentity(value));
    this.modelAttempts.set(value.id, clone(value));
    await this.appendEvent(call.runId, `agent.model.attempt_${value.state}`, value,undefined,call.generation);
  }

  async saveToolCall(value: AgentToolCall) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.toolCalls.get(value.id);
    if (existing) { assertImmutable("tool call",pickToolCallIdentity(existing),pickToolCallIdentity(value)); return; }
    this.toolCalls.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.tool.requested", value, value.createdAt,value.generation);
  }

  async getToolCall(toolCallId: string) {
    return clone(this.toolCalls.get(toolCallId) ?? null);
  }

  async listUnsettledToolCalls(runId: string) {
    const terminal = new Set(["policy_denied", "succeeded", "failed", "cancelled", "effect_unknown"]);
    const terminalTurns = new Set(["completed", "failed", "cancelled", "effect_unknown"]);
    return [...this.toolCalls.values()].filter((call) => {
      if (call.runId !== runId) return false;
      const turn = this.turns.get(call.turnId);
      return !terminal.has(call.state) || !this.results.has(call.id) || Boolean(turn && !terminalTurns.has(turn.state));
    }).map(clone);
  }

  async transitionToolCall(toolCallId: string, to: AgentToolCall["state"], generation: number) {
    const call = this.toolCalls.get(toolCallId);
    if (!call) throw new Error(`tool call not found: ${toolCallId}`);
    await this.assertGeneration(call.runId, generation);
    call.state = transitionToolCall(call.state, to);
    await this.appendEvent(call.runId, `agent.tool.${to}`, { toolCallId, tool: call.tool },undefined,generation);
  }

  async savePolicyDecision(value: AgentPolicyDecision) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.policyDecisions.get(value.id);
    if (existing) { assertImmutable("policy decision",pickPolicyIdentity(existing),pickPolicyIdentity(value)); return; }
    this.policyDecisions.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.policy.decision", value, value.evaluatedAt,value.generation);
  }

  async saveToolIntent(value: AgentToolIntent) {
    await this.assertGeneration(value.runId, value.generation);
    const existing=this.intents.get(value.toolCallId);
    if (existing) { assertImmutable("tool intent",pickIntentIdentity(existing),pickIntentIdentity(value)); return; }
    this.intents.set(value.toolCallId, clone(value));
    await this.appendEvent(value.runId, "agent.tool.intent_persisted", value, value.persistedAt,value.generation);
  }

  async saveToolResult(value: AgentToolResult) {
    await this.assertGeneration(value.runId, value.generation);
    const existing = this.results.get(value.toolCallId);
    if (existing) { assertImmutable("tool result",pickResultIdentity(existing),pickResultIdentity(value)); return clone(existing); }
    this.results.set(value.toolCallId, clone(value));
    await this.appendEvent(value.runId, "agent.tool.result_recorded", value, value.completedAt,value.generation);
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
    const existing=this.observations.get(value.id);
    if (existing) { assertImmutable("observation",pickObservationIdentity(existing),pickObservationIdentity(value)); return; }
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
    }, value.retrievedAt,value.browserGeneration);
  }

  async latestObservation(runId: string) {
    const ids = this.observationOrder.get(runId) ?? [];
    return clone(ids.length ? this.observations.get(ids[ids.length - 1])! : null);
  }

  async getObservationForToolCall(toolCallId:string) {
    return clone([...this.observations.values()].find((value)=>value.toolCallId===toolCallId)??null);
  }

  async saveCheckpoint(value: AgentCheckpoint) {
    await this.assertGeneration(value.runId, value.generation);
    this.checkpoints.set(value.runId, clone(value));
    await this.appendEvent(value.runId, "agent.checkpoint.saved", value, value.createdAt,value.generation);
  }

  async getCheckpoint(runId: string) {
    return clone(this.checkpoints.get(runId) ?? null);
  }

  async saveChallenge(value: ChallengeRecord) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.challenges.get(value.id);
    if (existing) { assertImmutable("challenge",pickChallengeIdentity(existing),pickChallengeIdentity(value)); return; }
    this.challenges.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.challenge.classified", value, value.createdAt,value.generation);
  }

  async getChallengeOccurrence(runId: string, fingerprint: string) {
    return Math.max(0, ...[...this.challenges.values()]
      .filter((value) => value.runId === runId && value.fingerprint === fingerprint)
      .map((value) => value.occurrence));
  }

  async saveCompletionProposal(value: CompletionProposal) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.proposals.get(value.id);
    if (existing) { assertImmutable("completion proposal",pickProposalIdentity(existing),pickProposalIdentity(value)); return; }
    this.proposals.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.completion.proposed", value, value.proposedAt,value.generation);
  }

  async saveCompletionAcceptance(value: CompletionAcceptance) {
    await this.assertGeneration(value.runId,value.generation);
    const existing=this.acceptances.get(value.id);
    if (existing) { assertImmutable("completion acceptance",pickAcceptanceIdentity(existing),pickAcceptanceIdentity(value)); return; }
    this.acceptances.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.completion.verifier_decided", value, value.decidedAt,value.generation);
  }

  async acceptContent(value: AcquiredContent) {
    await this.assertGeneration(value.runId, value.generation);
    const existing = this.contents.get(value.acceptanceId);
    if (existing) assertAcquiredIdentity(existing,value);
    else this.contents.set(value.acceptanceId, clone(value));
    const ids = this.contentByRun.get(value.runId) ?? [];
    if (!ids.includes(value.acceptanceId)) ids.push(value.acceptanceId);
    this.contentByRun.set(value.runId, ids);
    await this.appendEvent(value.runId, "agent.acquired_content.accepted", value, value.acceptedAt,value.generation);
    return clone(existing ?? value);
  }

  async getAcceptedContent(runId: string) {
    return (this.contentByRun.get(runId) ?? []).map((id) => clone(this.contents.get(id)!));
  }

  async saveBrowserSession(value: BrowserSessionRecord) {
    await this.assertGeneration(value.runId,value.generation);
    this.browserSessions.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.browser.session_saved", value, value.createdAt,value.generation);
  }

  async saveBrowserContext(value: BrowserContextRecord) {
    await this.assertGeneration(value.runId,value.generation);
    this.browserContexts.set(value.id, clone(value));
    await this.appendEvent(value.runId, "agent.browser.context_saved", value, value.createdAt,value.generation);
  }

  async appendEvent(runId: string, type: string, data: unknown, at = new Date().toISOString(), generation?:number) {
    if (generation !== undefined) await this.assertGeneration(runId,generation);
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
    if (this.requireRun(runId).state !== "completed") throw new Error("outbox can only be acknowledged for a completed run");
    outbox.state = "acknowledged";
    outbox.acknowledgedAt = at;
    await this.appendEvent(runId, "agent.outbox.acknowledged", { outboxId: outbox.id }, at);
  }

  async markOutboxDelivered(runId: string, at = new Date().toISOString()) {
    const outbox = this.outboxes.get(runId);
    if (!outbox) throw new Error(`outbox not found: ${runId}`);
    if (outbox.state === "pending") {
      outbox.state = "delivered";
      outbox.deliveredAt=at;
      outbox.attempts+=1;
    }
    await this.appendEvent(runId,"agent.outbox.delivered",{outboxId:outbox.id},at);
  }

  async getOutbox(runId: string) {
    return clone(this.outboxes.get(runId) ?? null);
  }

  async getBudget(runId: string) {
    return clone(this.budgets.get(runId) ?? null);
  }

  async listPendingOutbox(limit=25,now=new Date()) {
    return [...this.outboxes.values()].filter((value)=>value.state==="pending" && value.nextAttemptAt<=now.toISOString()).slice(0,limit).map(clone);
  }

  async saveBudget(value: AgentRunBudget,generation:number) {
    await this.assertGeneration(value.runId,generation);
    this.budgets.set(value.runId, clone(value));
    await this.appendEvent(value.runId, "agent.budget.updated", value.usage,undefined,generation);
  }

  async authorizeChallengeResume(runId:string,challengeVersion:number,tokenHash:string) {
    this.resumeAuthorizations.set(runId,{version:challengeVersion,tokenHash});
    const outbox=this.outboxes.get(runId);
    if (outbox) { outbox.state="pending"; outbox.nextAttemptAt=new Date().toISOString(); }
  }

  async hasChallengeResumeAuthorization(runId:string) {
    const value=this.resumeAuthorizations.get(runId); return Boolean(value && !value.consumedAt);
  }

  async consumeChallengeResumeAuthorization(runId:string,generation:number,at=new Date().toISOString()) {
    await this.assertGeneration(runId,generation);
    const value=this.resumeAuthorizations.get(runId);
    if (!value || value.consumedAt) return false;
    value.consumedAt=at; return true;
  }

  private requireRun(runId: string) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    return run;
  }
}

function assertAdmissionIdentity(existing:AgentRun,incoming:AgentRun) {
  const existingIdentity={runId:existing.runId,tenantId:existing.tenantId,resourceId:existing.resourceId,idempotencyKey:existing.idempotencyKey,
    mode:existing.mode,policySnapshotId:existing.policySnapshotId,completionContractVersion:existing.completionContractVersion,candidate:existing.candidate};
  const incomingIdentity={runId:incoming.runId,tenantId:incoming.tenantId,resourceId:incoming.resourceId,idempotencyKey:incoming.idempotencyKey,
    mode:incoming.mode,policySnapshotId:incoming.policySnapshotId,completionContractVersion:incoming.completionContractVersion,candidate:incoming.candidate};
  if (JSON.stringify(existingIdentity)!==JSON.stringify(incomingIdentity)) throw new Error(`agent run identity collision: ${incoming.runId}`);
}

function assertImmutable(label:string,existing:unknown,incoming:unknown) {
  if (JSON.stringify(existing)!==JSON.stringify(incoming)) throw new Error(`${label} identity collision`);
}
function pickTurnIdentity(value:AgentTurn) { return {id:value.id,runId:value.runId,sequence:value.sequence,pageStateHash:value.pageStateHash,generation:value.generation}; }
function pickModelCallIdentity(value:AgentModelCall) { return {id:value.id,runId:value.runId,turnId:value.turnId,generation:value.generation,
  role:value.role,route:value.route,contextManifestHash:value.contextManifestHash,stableInstructionsHash:value.stableInstructionsHash}; }
function pickToolCallIdentity(value:AgentToolCall) { return {id:value.id,runId:value.runId,turnId:value.turnId,modelCallId:value.modelCallId,
  planIndex:value.planIndex,tool:value.tool,arguments:value.arguments,generation:value.generation}; }
function pickPolicyIdentity(value:AgentPolicyDecision) { return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,allowed:value.allowed,
  reasonCode:value.reasonCode,policySnapshotId:value.policySnapshotId,generation:value.generation}; }
function pickIntentIdentity(value:AgentToolIntent) { return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,generation:value.generation,
  tool:value.tool,idempotencyKey:value.idempotencyKey,arguments:value.arguments}; }
function pickResultIdentity(value:AgentToolResult) { return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,generation:value.generation,
  state:value.state,effectCertainty:value.effectCertainty,output:value.output,errorCode:value.errorCode,errorMessage:value.errorMessage}; }
function pickObservationIdentity(value:ObservationEnvelope) { return {id:value.id,runId:value.runId,turnId:value.turnId,toolCallId:value.toolCallId,
  browserSessionId:value.browserSessionId,browserGeneration:value.browserGeneration,pageId:value.pageId,pageRevision:value.pageRevision,
  originUrl:value.originUrl,finalUrl:value.finalUrl,contentType:value.contentType,representationType:value.representationType,
  raw:value.raw,presented:value.presented,trustClassification:value.trustClassification}; }
function pickConfigurationIdentity(value:RunConfigurationSnapshot) { return {runId:value.runId,candidate:value.candidate,policy:value.policy,
  modelRouting:value.modelRouting,modelCapabilities:value.modelCapabilities}; }
function pickRunAttemptIdentity(value:AgentRunAttempt) { return {id:value.id,runId:value.runId,generation:value.generation,
  workerId:value.workerId,startedAt:value.startedAt}; }
function pickModelAttemptIdentity(value:AgentModelCallAttempt) { return {id:value.id,modelCallId:value.modelCallId,attempt:value.attempt,
  gateway:value.gateway,provider:value.provider,model:value.model}; }
function pickChallengeIdentity(value:ChallengeRecord) { return {id:value.id,runId:value.runId,observationId:value.observationId,state:value.state,
  fingerprint:value.fingerprint,occurrence:value.occurrence,disposition:value.disposition,generation:value.generation}; }
function pickProposalIdentity(value:CompletionProposal) { return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,
  citedObservationIds:value.citedObservationIds,generation:value.generation}; }
function pickAcceptanceIdentity(value:CompletionAcceptance) { return {id:value.id,runId:value.runId,proposalId:value.proposalId,
  outcome:value.outcome,deficits:value.deficits,generation:value.generation}; }

function idempotencyScope(tenantId:string,resourceId:string,key:string) { return `${tenantId}\u001f${resourceId}\u001f${key}`; }

function assertAcquiredIdentity(existing:AcquiredContent,incoming:AcquiredContent) {
  for (const key of ["tenantId","resourceId","candidateId","canonicalUrl","contentHash"] as const) {
    if (existing[key]!==incoming[key]) throw new Error(`acquired content identity collision on ${key}`);
  }
}
