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
  ObservationEnvelope,
  RunConfigurationSnapshot
} from "@distilled/agent-runtime/contracts";
import type { AdmitRunInput, RuntimeStore } from "@distilled/agent-runtime/persistence";
import { StaleGenerationError } from "@distilled/agent-runtime/persistence";
import { transitionRun, transitionToolCall, transitionTurn } from "@distilled/agent-runtime/state-machine";

type Row = Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;

function runFromRow(row: Row): AgentRun {
  return {
    runId: String(row.run_id),
    tenantId: String(row.tenant_id),
    resourceId: String(row.resource_id),
    idempotencyKey: String(row.idempotency_key),
    objective: String(row.objective),
    mode: row.mode as AgentRun["mode"],
    state: row.state as AgentRun["state"],
    generation: Number(row.generation),
    policySnapshotId: String(row.policy_snapshot_id),
    completionContractVersion: String(row.completion_contract_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class D1AgentRuntimeStore implements RuntimeStore {
  constructor(private readonly db: D1Database) {}

  async admitRun(input: AdmitRunInput) {
    const run = input.run;
    const results = await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO agent_runs
        (run_id,tenant_id,resource_id,idempotency_key,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        run.runId, run.tenantId, run.resourceId, run.idempotencyKey, run.objective, run.mode, run.state,
        run.generation, run.policySnapshotId, run.completionContractVersion, run.createdAt, run.updatedAt
      ),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_configurations (run_id,configuration_json,created_at) VALUES (?,?,?)`)
        .bind(run.runId, json(input.configuration), input.configuration.createdAt),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_budgets (run_id,budget_json,updated_at) VALUES (?,?,?)`)
        .bind(run.runId, json(input.budget), run.createdAt),
      this.db.prepare(`INSERT OR IGNORE INTO agent_outbox (id,run_id,kind,state,created_at) VALUES (?,?,?,?,?)`)
        .bind(input.outbox.id, run.runId, input.outbox.kind, input.outbox.state, input.outbox.createdAt),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
        VALUES (?,?,1,'agent.run.admitted',?,?)`).bind(
        `event_${run.runId}_1`,run.runId,json({
          tenantId:run.tenantId,resourceId:run.resourceId,objective:run.objective,mode:run.mode,state:run.state,
          policySnapshotId:run.policySnapshotId,completionContractVersion:run.completionContractVersion
        }),run.createdAt
      ),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
        VALUES (?,?,2,'agent.outbox.created',?,?)`).bind(
        `event_${run.runId}_2`, run.runId, json({ outboxId: input.outbox.id }), input.outbox.createdAt
      )
    ]);
    const persisted = await this.getRunByIdempotencyKey(run.idempotencyKey);
    if (!persisted) throw new Error("agent run admission did not persist");
    const outbox = await this.getOutbox(persisted.runId);
    if (!outbox) throw new Error("agent run outbox did not persist atomically");
    return { run: persisted, outbox, created: Number(results[0].meta.changes ?? 0) === 1 };
  }

  async getRun(runId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_runs WHERE run_id = ?").bind(runId).first<Row>();
    return row ? runFromRow(row) : null;
  }

  async getRunByIdempotencyKey(key: string) {
    const row = await this.db.prepare("SELECT * FROM agent_runs WHERE idempotency_key = ?").bind(key).first<Row>();
    return row ? runFromRow(row) : null;
  }

  async getRunConfiguration(runId: string) {
    const row = await this.db.prepare("SELECT configuration_json FROM agent_run_configurations WHERE run_id = ?")
      .bind(runId).first<Row>();
    return row ? parse<RunConfigurationSnapshot>(row.configuration_json) : null;
  }

  async getNextTurnSequence(runId: string) {
    const row = await this.db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next_sequence FROM agent_turns WHERE run_id=?")
      .bind(runId).first<Row>();
    return Number(row?.next_sequence ?? 1);
  }

  async acquireLease(runId: string, workerId: string, ttlMs: number, now = new Date()) {
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const results = await this.db.batch([
      this.db.prepare(`UPDATE agent_runs SET generation = generation + 1, updated_at = ?
        WHERE run_id = ? AND NOT EXISTS (
          SELECT 1 FROM agent_run_leases WHERE run_id = ? AND expires_at > ?
        )`).bind(now.toISOString(), runId, runId, now.toISOString()),
      this.db.prepare(`INSERT INTO agent_run_leases (run_id,generation,worker_id,expires_at)
        SELECT run_id,generation,?,? FROM agent_runs WHERE run_id = ? AND changes() = 1
        ON CONFLICT(run_id) DO UPDATE SET generation=excluded.generation,worker_id=excluded.worker_id,expires_at=excluded.expires_at`)
        .bind(workerId, expiresAt, runId)
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1) return null;
    const row = await this.db.prepare("SELECT * FROM agent_run_leases WHERE run_id = ?").bind(runId).first<Row>();
    if (!row) return null;
    const lease: AgentRunLease = {
      runId: String(row.run_id), generation: Number(row.generation), workerId: String(row.worker_id), expiresAt: String(row.expires_at)
    };
    await this.appendEvent(runId, "agent.lease.acquired", lease, now.toISOString());
    return lease;
  }

  async assertGeneration(runId: string, generation: number) {
    const row = await this.db.prepare("SELECT generation FROM agent_runs WHERE run_id = ?").bind(runId).first<Row>();
    if (!row) throw new Error(`run not found: ${runId}`);
    const actual = Number(row.generation);
    if (actual !== generation) throw new StaleGenerationError(runId, generation, actual);
  }

  async saveRunAttempt(value: AgentRunAttempt) {
    await this.assertGeneration(value.runId, value.generation);
    await this.db.prepare(`INSERT OR REPLACE INTO agent_run_attempts
      (id,run_id,generation,worker_id,started_at,completed_at,outcome) VALUES (?,?,?,?,?,?,?)`).bind(
      value.id, value.runId, value.generation, value.workerId, value.startedAt, value.completedAt ?? null, value.outcome ?? null
    ).run();
    await this.appendEvent(value.runId,value.completedAt ? "agent.run.attempt_completed" : "agent.run.attempt_started",value,value.completedAt ?? value.startedAt);
  }

  async transitionRun(runId: string, generation: number, to: AgentRunState, at = new Date().toISOString()) {
    const current = await this.getRun(runId);
    if (!current) throw new Error(`run not found: ${runId}`);
    transitionRun(current.state, to);
    const result = await this.db.prepare("UPDATE agent_runs SET state=?,updated_at=? WHERE run_id=? AND generation=?")
      .bind(to, at, runId, generation).run();
    if (Number(result.meta.changes ?? 0) !== 1) await this.assertGeneration(runId, generation);
    await this.appendEvent(runId, "agent.run.state_changed", { state: to, generation }, at);
    return (await this.getRun(runId))!;
  }

  async saveTurn(value: AgentTurn) {
    await this.db.prepare(`INSERT OR IGNORE INTO agent_turns (id,run_id,sequence,state,page_state_hash,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(value.id, value.runId, value.sequence, value.state, value.pageStateHash ?? null, value.createdAt).run();
    await this.appendEvent(value.runId, "agent.turn.created", value, value.createdAt);
  }

  async getTurn(turnId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_turns WHERE id=?").bind(turnId).first<Row>();
    if (!row) return null;
    return {
      id: String(row.id), runId: String(row.run_id), sequence: Number(row.sequence), state: row.state as AgentTurn["state"],
      pageStateHash: row.page_state_hash ? String(row.page_state_hash) : undefined, createdAt: String(row.created_at)
    };
  }

  async transitionTurn(turnId: string, to: AgentTurn["state"]) {
    const turn = await this.getTurn(turnId);
    if (!turn) throw new Error(`turn not found: ${turnId}`);
    transitionTurn(turn.state, to);
    await this.db.prepare("UPDATE agent_turns SET state=? WHERE id=?").bind(to, turnId).run();
    await this.appendEvent(turn.runId, "agent.turn.state_changed", { turnId, state: to });
  }

  async saveModelCall(value: AgentModelCall) {
    await this.assertGeneration(value.runId,value.generation);
    await this.db.prepare(`INSERT OR REPLACE INTO agent_model_calls
      (id,run_id,turn_id,generation,role,route_json,context_manifest_hash,stable_instructions_hash,state,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(value.id,value.runId,value.turnId,value.generation,value.role,json(value.route),value.contextManifestHash,value.stableInstructionsHash,value.state,value.createdAt).run();
    await this.appendEvent(value.runId, "agent.model.call_created", value, value.createdAt);
  }

  async transitionModelCall(modelCallId: string,state: AgentModelCall["state"],generation:number) {
    const row = await this.db.prepare("SELECT run_id FROM agent_model_calls WHERE id=?").bind(modelCallId).first<Row>();
    if (!row) throw new Error(`model call not found: ${modelCallId}`);
    await this.assertGeneration(String(row.run_id),generation);
    await this.db.prepare("UPDATE agent_model_calls SET state=? WHERE id=?").bind(state,modelCallId).run();
    await this.appendEvent(String(row.run_id),"agent.model.state_changed",{modelCallId,state});
  }

  async saveModelAttempt(value: AgentModelCallAttempt) {
    const call = await this.db.prepare("SELECT run_id,generation FROM agent_model_calls WHERE id=?").bind(value.modelCallId).first<Row>();
    if (!call) throw new Error(`model call not found: ${value.modelCallId}`);
    await this.assertGeneration(String(call.run_id),Number(call.generation));
    await this.db.prepare(`INSERT OR REPLACE INTO agent_model_call_attempts
      (id,model_call_id,provider,model,attempt,gateway,state,input_tokens,output_tokens,cost_usd,latency_ms,fallback_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      value.id,value.modelCallId,value.provider,value.model,value.attempt,value.gateway,value.state,value.inputTokens,
      value.outputTokens,value.costUsd,value.latencyMs,value.fallbackReason ?? null
    ).run();
    await this.appendEvent(String(call.run_id), `agent.model.attempt_${value.state}`, value);
  }

  async saveToolCall(value: AgentToolCall) {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_calls
      (id,run_id,turn_id,model_call_id,plan_index,tool,arguments_json,state,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      value.id,value.runId,value.turnId,value.modelCallId,value.planIndex,value.tool,json(value.arguments),value.state,value.createdAt
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.tool.requested", value, value.createdAt);
  }

  async getToolCall(toolCallId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_tool_calls WHERE id=?").bind(toolCallId).first<Row>();
    if (!row) return null;
    return {
      id:String(row.id),runId:String(row.run_id),turnId:String(row.turn_id),modelCallId:String(row.model_call_id),
      planIndex:Number(row.plan_index),tool:row.tool as AgentToolCall["tool"],arguments:parse(row.arguments_json),
      state:row.state as AgentToolCall["state"],createdAt:String(row.created_at)
    };
  }

  async listUnsettledToolCalls(runId: string) {
    const result = await this.db.prepare(`SELECT id FROM agent_tool_calls WHERE run_id=? AND state NOT IN
      ('policy_denied','succeeded','failed','cancelled','effect_unknown') ORDER BY created_at,id`).bind(runId).all<Row>();
    const values = await Promise.all(result.results.map((row) => this.getToolCall(String(row.id))));
    return values.filter((value): value is AgentToolCall => value !== null);
  }

  async transitionToolCall(toolCallId: string, to: AgentToolCall["state"], generation: number) {
    const call = await this.getToolCall(toolCallId);
    if (!call) throw new Error(`tool call not found: ${toolCallId}`);
    transitionToolCall(call.state, to);
    const result = await this.db.prepare(`UPDATE agent_tool_calls SET state=? WHERE id=? AND EXISTS
      (SELECT 1 FROM agent_runs WHERE run_id=agent_tool_calls.run_id AND generation=?)`).bind(to,toolCallId,generation).run();
    if (Number(result.meta.changes ?? 0) !== 1) await this.assertGeneration(call.runId,generation);
    await this.appendEvent(call.runId, `agent.tool.${to}`, { toolCallId, tool: call.tool });
  }

  async savePolicyDecision(value: AgentPolicyDecision) {
    await this.db.prepare(`INSERT OR REPLACE INTO agent_policy_decisions
      (id,run_id,tool_call_id,allowed,reason_code,policy_snapshot_id,evaluated_at) VALUES (?,?,?,?,?,?,?)`).bind(
      value.id,value.runId,value.toolCallId,value.allowed ? 1 : 0,value.reasonCode,value.policySnapshotId,value.evaluatedAt
    ).run();
    await this.appendEvent(value.runId, "agent.policy.decision", value, value.evaluatedAt);
  }

  async saveToolIntent(value: AgentToolIntent) {
    await this.assertGeneration(value.runId, value.generation);
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_intents
      (id,run_id,tool_call_id,generation,tool,idempotency_key,arguments_json,persisted_at) VALUES (?,?,?,?,?,?,?,?)`).bind(
      value.id,value.runId,value.toolCallId,value.generation,value.tool,value.idempotencyKey,json(value.arguments),value.persistedAt
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.tool.intent_persisted", value, value.persistedAt);
  }

  async saveToolResult(value: AgentToolResult) {
    await this.assertGeneration(value.runId,value.generation);
    const existing = await this.getToolResult(value.toolCallId);
    if (existing) return existing;
    await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_results
      (id,run_id,tool_call_id,generation,state,effect_certainty,output_json,error_code,error_message,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
      value.id,value.runId,value.toolCallId,value.generation,value.state,value.effectCertainty,value.output === undefined ? null : json(value.output),
      value.errorCode ?? null,value.errorMessage ?? null,value.completedAt
    ).run();
    await this.appendEvent(value.runId, "agent.tool.result_recorded", value, value.completedAt);
    return (await this.getToolResult(value.toolCallId))!;
  }

  async getToolIntent(toolCallId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_tool_intents WHERE tool_call_id=?").bind(toolCallId).first<Row>();
    if (!row) return null;
    return {
      id:String(row.id),runId:String(row.run_id),toolCallId:String(row.tool_call_id),idempotencyKey:String(row.idempotency_key),
      generation:Number(row.generation),tool:row.tool as AgentToolIntent["tool"],arguments:parse(row.arguments_json),persistedAt:String(row.persisted_at)
    };
  }

  async getToolResult(toolCallId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_tool_results WHERE tool_call_id=?").bind(toolCallId).first<Row>();
    if (!row) return null;
    return {
      id:String(row.id),runId:String(row.run_id),toolCallId:String(row.tool_call_id),generation:Number(row.generation),state:row.state as AgentToolResult["state"],
      effectCertainty:row.effect_certainty as AgentToolResult["effectCertainty"],
      output:row.output_json == null ? undefined : parse(row.output_json),errorCode:row.error_code ? String(row.error_code) : undefined,
      errorMessage:row.error_message ? String(row.error_message) : undefined,completedAt:String(row.completed_at)
    };
  }

  async saveObservation(value: ObservationEnvelope) {
    await this.assertGeneration(value.runId,value.browserGeneration);
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_observations (id,run_id,turn_id,tool_call_id,envelope_json,retrieved_at) VALUES (?,?,?,?,?,?)`)
      .bind(value.id,value.runId,value.turnId,value.toolCallId,json(value),value.retrievedAt).run();
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.observation.persisted", {
      observationId:value.id,trustClassification:value.trustClassification,representationType:value.representationType,
      rawHash:value.raw.hash,presentedHash:value.presented.hash
    }, value.retrievedAt);
  }

  async latestObservation(runId: string) {
    const row = await this.db.prepare("SELECT envelope_json FROM agent_observations WHERE run_id=? ORDER BY retrieved_at DESC,rowid DESC LIMIT 1")
      .bind(runId).first<Row>();
    return row ? parse<ObservationEnvelope>(row.envelope_json) : null;
  }

  async saveCheckpoint(value: AgentCheckpoint) {
    await this.assertGeneration(value.runId,value.generation);
    await this.db.prepare(`INSERT INTO agent_checkpoints (run_id,generation,checkpoint_json,created_at) VALUES (?,?,?,?)
      ON CONFLICT(run_id) DO UPDATE SET generation=excluded.generation,checkpoint_json=excluded.checkpoint_json,created_at=excluded.created_at`)
      .bind(value.runId,value.generation,json(value),value.createdAt).run();
    await this.appendEvent(value.runId,"agent.checkpoint.saved",value,value.createdAt);
  }

  async getCheckpoint(runId: string) {
    const row = await this.db.prepare("SELECT checkpoint_json FROM agent_checkpoints WHERE run_id=?").bind(runId).first<Row>();
    return row ? parse<AgentCheckpoint>(row.checkpoint_json) : null;
  }

  async saveChallenge(value: ChallengeRecord) { await this.saveJsonEvent("agent_challenges","challenge_json",value.id,value.runId,value,value.createdAt,"agent.challenge.classified"); }
  async getChallengeOccurrence(runId: string, fingerprint: string) {
    const result = await this.db.prepare("SELECT challenge_json FROM agent_challenges WHERE run_id=?").bind(runId).all<Row>();
    return Math.max(0, ...result.results.map((row) => parse<ChallengeRecord>(row.challenge_json))
      .filter((value) => value.fingerprint === fingerprint).map((value) => value.occurrence));
  }
  async saveCompletionProposal(value: CompletionProposal) { await this.saveJsonEvent("agent_completion_proposals","proposal_json",value.id,value.runId,value,value.proposedAt,"agent.completion.proposed"); }

  async saveCompletionAcceptance(value: CompletionAcceptance) {
    await this.db.prepare(`INSERT OR REPLACE INTO agent_completion_acceptances (id,run_id,proposal_id,acceptance_json,decided_at) VALUES (?,?,?,?,?)`)
      .bind(value.id,value.runId,value.proposalId,json(value),value.decidedAt).run();
    await this.appendEvent(value.runId,"agent.completion.verifier_decided",value,value.decidedAt);
  }

  async acceptContent(value: AcquiredContent) {
    await this.assertGeneration(value.runId,value.generation);
    await this.db.prepare(`INSERT OR IGNORE INTO acquired_content
      (acceptance_id,run_id,generation,canonical_url,content_hash,content_json,accepted_at) VALUES (?,?,?,?,?,?,?)`).bind(
      value.acceptanceId,value.runId,value.generation,value.canonicalUrl,value.contentHash,json(value),value.acceptedAt
    ).run();
    const row = await this.db.prepare("SELECT content_json FROM acquired_content WHERE acceptance_id=?").bind(value.acceptanceId).first<Row>();
    if (!row) throw new Error("accepted content did not persist");
    await this.appendEvent(value.runId,"agent.acquired_content.accepted",value,value.acceptedAt);
    return parse<AcquiredContent>(row.content_json);
  }

  async getAcceptedContent(runId: string) {
    const result = await this.db.prepare("SELECT content_json FROM acquired_content WHERE run_id=? ORDER BY accepted_at,acceptance_id")
      .bind(runId).all<Row>();
    return result.results.map((row) => parse<AcquiredContent>(row.content_json));
  }

  async saveBrowserSession(value: BrowserSessionRecord) {
    await this.assertGeneration(value.runId,value.generation);
    await this.db.prepare(`INSERT INTO agent_browser_sessions (id,run_id,tenant_id,generation,state,record_json,created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state,record_json=excluded.record_json`)
      .bind(value.id,value.runId,value.tenantId,value.generation,value.state,json(value),value.createdAt).run();
    await this.appendEvent(value.runId,"agent.browser.session_saved",value,value.createdAt);
  }

  async saveBrowserContext(value: BrowserContextRecord) {
    await this.assertGeneration(value.runId,value.generation);
    await this.db.prepare(`INSERT INTO agent_browser_contexts (id,browser_session_id,run_id,tenant_id,generation,record_json,created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json`)
      .bind(value.id,value.browserSessionId,value.runId,value.tenantId,value.generation,json(value),value.createdAt).run();
    await this.appendEvent(value.runId,"agent.browser.context_saved",value,value.createdAt);
  }

  async appendEvent(runId: string, type: string, data: unknown, at = new Date().toISOString()) {
    const eventId = crypto.randomUUID();
    await this.db.prepare(`INSERT INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
      SELECT ?,?,COALESCE(MAX(sequence),0)+1,?,?,? FROM agent_run_events WHERE run_id=?`)
      .bind(eventId,runId,type,json(data),at,runId).run();
    const row = await this.db.prepare("SELECT event_id,run_id,sequence,type,data_json,created_at FROM agent_run_events WHERE event_id=?")
      .bind(eventId).first<Row>();
    if (!row) throw new Error("event did not persist");
    return { id:String(row.event_id),runId:String(row.run_id),sequence:Number(row.sequence),type:String(row.type),data:parse(row.data_json),createdAt:String(row.created_at) };
  }

  async listEvents(runId: string) {
    const result = await this.db.prepare("SELECT event_id,run_id,sequence,type,data_json,created_at FROM agent_run_events WHERE run_id=? ORDER BY sequence")
      .bind(runId).all<Row>();
    return result.results.map((row): AgentRunEvent => ({
      id:String(row.event_id),runId:String(row.run_id),sequence:Number(row.sequence),type:String(row.type),data:parse(row.data_json),createdAt:String(row.created_at)
    }));
  }

  async acknowledgeOutbox(runId: string, at = new Date().toISOString()) {
    await this.db.prepare("UPDATE agent_outbox SET state='acknowledged',acknowledged_at=? WHERE run_id=?")
      .bind(at,runId).run();
    await this.appendEvent(runId,"agent.outbox.acknowledged",{ runId },at);
  }

  async markOutboxDelivered(runId:string,at=new Date().toISOString()) {
    await this.db.prepare("UPDATE agent_outbox SET state='delivered' WHERE run_id=? AND state='pending'").bind(runId).run();
    await this.appendEvent(runId,"agent.outbox.delivered",{runId},at);
  }

  async getOutbox(runId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_outbox WHERE run_id=?").bind(runId).first<Row>();
    if (!row) return null;
    return { id:String(row.id),runId:String(row.run_id),kind:"agent_run_wake" as const,state:row.state as AgentOutbox["state"],createdAt:String(row.created_at),
      acknowledgedAt:row.acknowledged_at ? String(row.acknowledged_at) : undefined };
  }

  async getBudget(runId: string) {
    const row = await this.db.prepare("SELECT budget_json FROM agent_run_budgets WHERE run_id=?").bind(runId).first<Row>();
    return row ? parse<AgentRunBudget>(row.budget_json) : null;
  }

  async saveBudget(value: AgentRunBudget) {
    const at = new Date().toISOString();
    await this.db.prepare("UPDATE agent_run_budgets SET budget_json=?,updated_at=? WHERE run_id=?").bind(json(value),at,value.runId).run();
    await this.appendEvent(value.runId,"agent.budget.updated",value.usage,at);
  }

  private async saveJsonEvent(table: string,column: string,id: string,runId: string,value: unknown,at: string,event: string) {
    const timeColumn = table === "agent_challenges" ? "created_at" : "proposed_at";
    await this.db.prepare(`INSERT OR REPLACE INTO ${table} (id,run_id,${column},${timeColumn}) VALUES (?,?,?,?)`)
      .bind(id,runId,json(value),at).run();
    await this.appendEvent(runId,event,value,at);
  }
}
