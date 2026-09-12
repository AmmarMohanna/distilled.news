import type {
  AcquiredContent,
  CanonicalAcquiredContent,
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
  InteractionGroundingRecord,
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
    ,candidate:{candidateId:String(row.candidate_id),canonicalUrl:String(row.candidate_url),publisherId:String(row.publisher_id),acquisitionAttempt:String(row.acquisition_attempt)}
  };
}

export class D1AgentRuntimeStore implements RuntimeStore {
  constructor(private readonly db: D1Database) {}

  async admitRun(input: AdmitRunInput) {
    const run = input.run;
    const results = await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO agent_runs
        (run_id,tenant_id,resource_id,idempotency_key,candidate_id,candidate_url,publisher_id,acquisition_attempt,objective,mode,state,generation,policy_snapshot_id,completion_contract_version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        run.runId, run.tenantId, run.resourceId, run.idempotencyKey,run.candidate.candidateId,run.candidate.canonicalUrl,run.candidate.publisherId,run.candidate.acquisitionAttempt,run.objective, run.mode, run.state,
        run.generation, run.policySnapshotId, run.completionContractVersion, run.createdAt, run.updatedAt
      ),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_configurations (run_id,configuration_json,created_at)
        SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND tenant_id=? AND resource_id=? AND idempotency_key=?)`)
        .bind(run.runId,json(input.configuration),input.configuration.createdAt,run.runId,run.tenantId,run.resourceId,run.idempotencyKey),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_budgets (run_id,budget_json,updated_at)
        SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND tenant_id=? AND resource_id=? AND idempotency_key=?)`)
        .bind(run.runId,json(input.budget),run.createdAt,run.runId,run.tenantId,run.resourceId,run.idempotencyKey),
      this.db.prepare(`INSERT OR IGNORE INTO agent_outbox (id,run_id,kind,state,created_at,attempts,next_attempt_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND tenant_id=? AND resource_id=? AND idempotency_key=?)`)
        .bind(input.outbox.id,run.runId,input.outbox.kind,input.outbox.state,input.outbox.createdAt,input.outbox.attempts,input.outbox.nextAttemptAt,
          run.runId,run.tenantId,run.resourceId,run.idempotencyKey),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
        SELECT ?,?,1,'agent.run.admitted',?,? WHERE EXISTS
        (SELECT 1 FROM agent_runs WHERE run_id=? AND tenant_id=? AND resource_id=? AND idempotency_key=?)`).bind(
        `event_${run.runId}_1`,run.runId,json({
          tenantId:run.tenantId,resourceId:run.resourceId,objective:run.objective,mode:run.mode,state:run.state,
          policySnapshotId:run.policySnapshotId,completionContractVersion:run.completionContractVersion
        }),run.createdAt,run.runId,run.tenantId,run.resourceId,run.idempotencyKey
      ),
      this.db.prepare(`INSERT OR IGNORE INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
        SELECT ?,?,2,'agent.outbox.created',?,? WHERE EXISTS
        (SELECT 1 FROM agent_runs WHERE run_id=? AND tenant_id=? AND resource_id=? AND idempotency_key=?)`).bind(
        `event_${run.runId}_2`,run.runId,json({outboxId:input.outbox.id}),input.outbox.createdAt,
        run.runId,run.tenantId,run.resourceId,run.idempotencyKey
      )
    ]);
    const persisted = await this.getRunByIdempotencyKey(run.tenantId,run.resourceId,run.idempotencyKey);
    if (!persisted) throw new Error("agent run admission did not persist");
    assertAdmissionIdentity(persisted,run);
    const outbox = await this.getOutbox(persisted.runId);
    if (!outbox) throw new Error("agent run outbox did not persist atomically");
    const configuration=await this.getRunConfiguration(persisted.runId);
    if (!configuration) throw new Error("agent run configuration did not persist atomically");
    assertImmutable("run configuration",pickConfigurationIdentity(configuration),pickConfigurationIdentity(input.configuration));
    const budget=await this.getBudget(persisted.runId);
    if (!budget) throw new Error("agent run budget did not persist atomically");
    assertImmutable("run budget",budget.limits,input.budget.limits);
    assertImmutable("run outbox",{id:outbox.id,runId:outbox.runId,kind:outbox.kind},{id:input.outbox.id,runId:input.outbox.runId,kind:input.outbox.kind});
    return { run: persisted, outbox, created: Number(results[0].meta.changes ?? 0) === 1 };
  }

  async getRun(runId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_runs WHERE run_id = ?").bind(runId).first<Row>();
    return row ? runFromRow(row) : null;
  }

  async getRunByIdempotencyKey(tenantId:string,resourceId:string,key: string) {
    const row = await this.db.prepare("SELECT * FROM agent_runs WHERE tenant_id=? AND resource_id=? AND idempotency_key = ?").bind(tenantId,resourceId,key).first<Row>();
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
        .bind(workerId, expiresAt, runId),
      this.db.prepare(`UPDATE agent_browser_sessions SET state='crashed' WHERE run_id=? AND generation <
        (SELECT generation FROM agent_runs WHERE run_id=?) AND state NOT IN ('closed','crashed') AND EXISTS
        (SELECT 1 FROM agent_run_leases WHERE run_id=? AND worker_id=? AND expires_at=?)`)
        .bind(runId,runId,runId,workerId,expiresAt)
    ]);
    if (Number(results[0].meta.changes ?? 0) !== 1) return null;
    const row = await this.db.prepare("SELECT * FROM agent_run_leases WHERE run_id = ?").bind(runId).first<Row>();
    if (!row) return null;
    const lease: AgentRunLease = {
      runId: String(row.run_id), generation: Number(row.generation), workerId: String(row.worker_id), expiresAt: String(row.expires_at)
    };
    await this.appendEvent(runId, "agent.lease.acquired", lease, now.toISOString(),lease.generation);
    return lease;
  }

  async renewLease(runId:string,generation:number,workerId:string,ttlMs:number,now=new Date()) {
    const expiresAt=new Date(now.getTime()+ttlMs).toISOString();
    const result=await this.db.prepare(`UPDATE agent_run_leases SET expires_at=? WHERE run_id=? AND generation=? AND worker_id=? AND expires_at>?`)
      .bind(expiresAt,runId,generation,workerId,now.toISOString()).run();
    if (Number(result.meta.changes??0)!==1) throw new StaleGenerationError(runId,generation,(await this.getRun(runId))?.generation??-1);
    return {runId,generation,workerId,expiresAt};
  }

  async assertGeneration(runId: string, generation: number) {
    const row = await this.db.prepare(`SELECT r.generation,l.expires_at FROM agent_runs r LEFT JOIN agent_run_leases l ON l.run_id=r.run_id AND l.generation=r.generation WHERE r.run_id = ?`).bind(runId).first<Row>();
    if (!row) throw new Error(`run not found: ${runId}`);
    const actual = Number(row.generation);
    if (actual !== generation) throw new StaleGenerationError(runId, generation, actual);
    if (generation>0 && (!row.expires_at || String(row.expires_at)<=new Date().toISOString())) throw new StaleGenerationError(runId,generation,actual);
  }

  async saveRunAttempt(value: AgentRunAttempt) {
    const result=await this.db.prepare(`INSERT INTO agent_run_attempts
      (id,run_id,generation,worker_id,started_at,completed_at,outcome)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND worker_id=? AND expires_at>?)
      ON CONFLICT(id) DO UPDATE SET completed_at=excluded.completed_at,outcome=excluded.outcome
      WHERE agent_run_attempts.run_id=excluded.run_id AND agent_run_attempts.generation=excluded.generation
        AND agent_run_attempts.worker_id=excluded.worker_id AND agent_run_attempts.started_at=excluded.started_at`).bind(
      value.id,value.runId,value.generation,value.workerId,value.startedAt,value.completedAt??null,value.outcome??null,
      value.runId,value.generation,value.workerId,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      throw new Error(`run attempt identity collision: ${value.id}`);
    }
    await this.appendEvent(value.runId,value.completedAt ? "agent.run.attempt_completed" : "agent.run.attempt_started",value,value.completedAt ?? value.startedAt,value.generation);
  }

  async transitionRun(runId: string, generation: number, to: AgentRunState, at = new Date().toISOString()) {
    const current = await this.getRun(runId);
    if (!current) throw new Error(`run not found: ${runId}`);
    transitionRun(current.state, to);
    const result = generation===0
      ? await this.db.prepare("UPDATE agent_runs SET state=?,updated_at=? WHERE run_id=? AND generation=0").bind(to,at,runId).run()
      : await this.db.prepare(`UPDATE agent_runs SET state=?,updated_at=? WHERE run_id=? AND generation=? AND EXISTS
          (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
          .bind(to,at,runId,generation,runId,generation,new Date().toISOString()).run();
    if (Number(result.meta.changes ?? 0) !== 1) await this.assertGeneration(runId, generation);
    await this.appendEvent(runId, "agent.run.state_changed", { state: to, generation }, at,generation > 0 ? generation : undefined);
    return (await this.getRun(runId))!;
  }

  async saveTurn(value: AgentTurn) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_turns (id,run_id,sequence,state,page_state_hash,created_at,generation)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,value.sequence,value.state,value.pageStateHash??null,value.createdAt,value.generation,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const existing=await this.getTurn(value.id);
      if (!existing) throw new Error("turn did not persist");
      assertImmutable("turn",pickTurnIdentity(existing),pickTurnIdentity(value));
    }
    await this.appendEvent(value.runId, "agent.turn.created", value, value.createdAt,value.generation);
  }

  async getTurn(turnId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_turns WHERE id=?").bind(turnId).first<Row>();
    if (!row) return null;
    return {
      id: String(row.id), runId: String(row.run_id), sequence: Number(row.sequence), state: row.state as AgentTurn["state"],
      pageStateHash: row.page_state_hash ? String(row.page_state_hash) : undefined, createdAt: String(row.created_at),generation:Number(row.generation)
    };
  }

  async transitionTurn(turnId: string, to: AgentTurn["state"],generation:number) {
    const turn = await this.getTurn(turnId);
    if (!turn) throw new Error(`turn not found: ${turnId}`);
    transitionTurn(turn.state, to);
    const result=await this.db.prepare(`UPDATE agent_turns SET state=? WHERE id=? AND EXISTS
      (SELECT 1 FROM agent_run_leases l WHERE l.run_id=agent_turns.run_id AND l.generation=? AND l.expires_at>?)`)
      .bind(to,turnId,generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(turn.runId,generation);
    await this.appendEvent(turn.runId, "agent.turn.state_changed", { turnId, state: to },undefined,generation);
  }

  async saveModelCall(value: AgentModelCall) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_model_calls
      (id,run_id,turn_id,generation,role,route_json,context_manifest_hash,stable_instructions_hash,state,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,value.turnId,value.generation,value.role,json(value.route),value.contextManifestHash,value.stableInstructionsHash,value.state,value.createdAt,
        value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const row=await this.db.prepare("SELECT * FROM agent_model_calls WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("model call did not persist");
      assertImmutable("model call",{
        id:String(row.id),runId:String(row.run_id),turnId:String(row.turn_id),generation:Number(row.generation),role:String(row.role),
        route:parse(row.route_json),contextManifestHash:String(row.context_manifest_hash),stableInstructionsHash:String(row.stable_instructions_hash)
      },pickModelCallIdentity(value));
    } else await this.appendEvent(value.runId, "agent.model.call_created", value, value.createdAt,value.generation);
  }

  async transitionModelCall(modelCallId: string,state: AgentModelCall["state"],generation:number) {
    const row = await this.db.prepare("SELECT run_id FROM agent_model_calls WHERE id=?").bind(modelCallId).first<Row>();
    if (!row) throw new Error(`model call not found: ${modelCallId}`);
    const result=await this.db.prepare(`UPDATE agent_model_calls SET state=? WHERE id=? AND EXISTS
      (SELECT 1 FROM agent_run_leases l WHERE l.run_id=agent_model_calls.run_id AND l.generation=? AND l.expires_at>?)`)
      .bind(state,modelCallId,generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(String(row.run_id),generation);
    await this.appendEvent(String(row.run_id),"agent.model.state_changed",{modelCallId,state},undefined,generation);
  }

  async saveModelAttempt(value: AgentModelCallAttempt) {
    const call = await this.db.prepare("SELECT run_id,generation FROM agent_model_calls WHERE id=?").bind(value.modelCallId).first<Row>();
    if (!call) throw new Error(`model call not found: ${value.modelCallId}`);
    const result=await this.db.prepare(`INSERT INTO agent_model_call_attempts
      (id,model_call_id,requested_provider,actual_provider,requested_model,actual_model,requested_deployment,actual_deployment,
       attempt,requested_gateway,actual_gateway,state,input_tokens,output_tokens,cost_usd,latency_ms,fallback_reason)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      ON CONFLICT(id) DO UPDATE SET actual_provider=excluded.actual_provider,actual_model=excluded.actual_model,
        actual_deployment=excluded.actual_deployment,actual_gateway=excluded.actual_gateway,state=excluded.state,input_tokens=excluded.input_tokens,
        output_tokens=excluded.output_tokens,cost_usd=excluded.cost_usd,latency_ms=excluded.latency_ms,fallback_reason=excluded.fallback_reason
      WHERE agent_model_call_attempts.model_call_id=excluded.model_call_id AND agent_model_call_attempts.attempt=excluded.attempt
        AND agent_model_call_attempts.requested_gateway=excluded.requested_gateway
        AND agent_model_call_attempts.requested_deployment=excluded.requested_deployment
        AND agent_model_call_attempts.requested_provider=excluded.requested_provider
        AND agent_model_call_attempts.requested_model=excluded.requested_model`).bind(
      value.id,value.modelCallId,value.requestedProvider,value.actualProvider??null,value.requestedModel,value.actualModel??null,
      value.requestedDeployment,value.actualDeployment??null,value.attempt,value.requestedGateway,value.actualGateway??null,value.state,value.inputTokens,
      value.outputTokens,value.costUsd,value.latencyMs,value.fallbackReason ?? null,String(call.run_id),Number(call.generation),new Date().toISOString()
    ).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(String(call.run_id),Number(call.generation));
      throw new Error(`model attempt identity collision: ${value.id}`);
    }
    await this.appendEvent(String(call.run_id), `agent.model.attempt_${value.state}`, value,undefined,Number(call.generation));
  }

  async saveToolCall(value: AgentToolCall) {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_calls
      (id,run_id,turn_id,model_call_id,plan_index,tool,arguments_json,state,created_at,generation)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`).bind(
      value.id,value.runId,value.turnId,value.modelCallId,value.planIndex,value.tool,json(value.arguments),value.state,value.createdAt,value.generation,
      value.runId,value.generation,new Date().toISOString()
    ).run();
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.tool.requested", value, value.createdAt,value.generation);
    else {
      await this.assertGeneration(value.runId,value.generation);
      const existing=await this.getToolCall(value.id);
      if (!existing) throw new Error("tool call did not persist");
      assertImmutable("tool call",pickToolCallIdentity(existing),pickToolCallIdentity(value));
    }
  }

  async getToolCall(toolCallId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_tool_calls WHERE id=?").bind(toolCallId).first<Row>();
    if (!row) return null;
    return {
      id:String(row.id),runId:String(row.run_id),turnId:String(row.turn_id),modelCallId:String(row.model_call_id),
      planIndex:Number(row.plan_index),tool:row.tool as AgentToolCall["tool"],arguments:parse(row.arguments_json),
      state:row.state as AgentToolCall["state"],createdAt:String(row.created_at),generation:Number(row.generation)
    };
  }

  async listUnsettledToolCalls(runId: string) {
    const result = await this.db.prepare(`SELECT c.id FROM agent_tool_calls c
      LEFT JOIN agent_tool_results r ON r.tool_call_id=c.id
      LEFT JOIN agent_turns t ON t.id=c.turn_id
      WHERE c.run_id=? AND (c.state NOT IN ('policy_denied','succeeded','failed','cancelled','effect_unknown') OR r.id IS NULL
        OR t.state NOT IN ('completed','failed','cancelled','effect_unknown'))
      ORDER BY c.created_at,c.id`).bind(runId).all<Row>();
    const values = await Promise.all(result.results.map((row) => this.getToolCall(String(row.id))));
    return values.filter((value): value is AgentToolCall => value !== null);
  }

  async transitionToolCall(toolCallId: string, to: AgentToolCall["state"], generation: number) {
    const call = await this.getToolCall(toolCallId);
    if (!call) throw new Error(`tool call not found: ${toolCallId}`);
    transitionToolCall(call.state, to);
    const result = await this.db.prepare(`UPDATE agent_tool_calls SET state=? WHERE id=? AND EXISTS
      (SELECT 1 FROM agent_run_leases WHERE run_id=agent_tool_calls.run_id AND generation=? AND expires_at>?)`)
      .bind(to,toolCallId,generation,new Date().toISOString()).run();
    if (Number(result.meta.changes ?? 0) !== 1) await this.assertGeneration(call.runId,generation);
    await this.appendEvent(call.runId, `agent.tool.${to}`, { toolCallId, tool: call.tool },undefined,generation);
  }

  async savePolicyDecision(value: AgentPolicyDecision) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_policy_decisions
      (id,run_id,tool_call_id,allowed,reason_code,policy_snapshot_id,evaluated_at,generation)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`).bind(
      value.id,value.runId,value.toolCallId,value.allowed?1:0,value.reasonCode,value.policySnapshotId,value.evaluatedAt,value.generation,
      value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const row=await this.db.prepare("SELECT * FROM agent_policy_decisions WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("policy decision did not persist");
      assertImmutable("policy decision",{
        id:String(row.id),runId:String(row.run_id),toolCallId:String(row.tool_call_id),allowed:Boolean(row.allowed),
        reasonCode:String(row.reason_code),policySnapshotId:String(row.policy_snapshot_id),generation:Number(row.generation)
      },pickPolicyIdentity(value));
    } else await this.appendEvent(value.runId, "agent.policy.decision", value, value.evaluatedAt,value.generation);
  }

  async saveToolIntent(value: AgentToolIntent) {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_intents
      (id,run_id,tool_call_id,generation,tool,idempotency_key,arguments_json,persisted_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`).bind(
      value.id,value.runId,value.toolCallId,value.generation,value.tool,value.idempotencyKey,json(value.arguments),value.persistedAt,
      value.runId,value.generation,new Date().toISOString()
    ).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const existing=await this.getToolIntent(value.toolCallId);
      if (!existing) throw new Error("tool intent did not persist");
      assertImmutable("tool intent",pickIntentIdentity(existing),pickIntentIdentity(value));
    }
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.tool.intent_persisted", value, value.persistedAt,value.generation);
  }

  async saveInteractionGrounding(value: InteractionGroundingRecord) {
    await this.assertGeneration(value.runId,value.generation);
    await this.appendEvent(value.runId,"agent.interaction.grounding_persisted",value,value.createdAt,value.generation);
  }

  async saveToolResult(value: AgentToolResult) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_tool_results
      (id,run_id,tool_call_id,generation,state,effect_certainty,output_json,error_code,error_message,completed_at)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`).bind(
      value.id,value.runId,value.toolCallId,value.generation,value.state,value.effectCertainty,value.output === undefined ? null : json(value.output),
      value.errorCode ?? null,value.errorMessage ?? null,value.completedAt,value.runId,value.generation,new Date().toISOString()
    ).run();
    const persisted=await this.getToolResult(value.toolCallId);
    if (!persisted) await this.assertGeneration(value.runId,value.generation);
    if (!persisted) throw new Error("tool result did not persist");
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(value.runId,value.generation);
    assertImmutable("tool result",pickResultIdentity(persisted),pickResultIdentity(value));
    if (Number(result.meta.changes??0)===1) await this.appendEvent(value.runId, "agent.tool.result_recorded", value, value.completedAt,value.generation);
    return persisted;
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
    const result = await this.db.prepare(`INSERT OR IGNORE INTO agent_observations (id,run_id,turn_id,tool_call_id,envelope_json,retrieved_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,value.turnId,value.toolCallId,json(value),value.retrievedAt,value.runId,value.browserGeneration,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.browserGeneration);
      const row=await this.db.prepare("SELECT envelope_json FROM agent_observations WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("observation did not persist");
      assertImmutable("observation",pickObservationIdentity(parse<ObservationEnvelope>(row.envelope_json)),pickObservationIdentity(value));
    }
    if (Number(result.meta.changes ?? 0) === 1) await this.appendEvent(value.runId, "agent.observation.persisted", {
      observationId:value.id,trustClassification:value.trustClassification,representationType:value.representationType,
      rawHash:value.raw.hash,presentedHash:value.presented.hash
    }, value.retrievedAt,value.browserGeneration);
  }

  async latestObservation(runId: string) {
    const row = await this.db.prepare("SELECT envelope_json FROM agent_observations WHERE run_id=? ORDER BY retrieved_at DESC,rowid DESC LIMIT 1")
      .bind(runId).first<Row>();
    return row ? parse<ObservationEnvelope>(row.envelope_json) : null;
  }

  async getObservationForToolCall(toolCallId:string) {
    const row=await this.db.prepare("SELECT envelope_json FROM agent_observations WHERE tool_call_id=? ORDER BY retrieved_at DESC LIMIT 1")
      .bind(toolCallId).first<Row>(); return row?parse<ObservationEnvelope>(row.envelope_json):null;
  }

  async saveCheckpoint(value: AgentCheckpoint) {
    const result=await this.db.prepare(`INSERT INTO agent_checkpoints (run_id,generation,checkpoint_json,created_at)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      ON CONFLICT(run_id) DO UPDATE SET generation=excluded.generation,checkpoint_json=excluded.checkpoint_json,created_at=excluded.created_at
      WHERE excluded.generation=agent_checkpoints.generation`)
      .bind(value.runId,value.generation,json(value),value.createdAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(value.runId,value.generation);
    await this.appendEvent(value.runId,"agent.checkpoint.saved",value,value.createdAt,value.generation);
  }

  async getCheckpoint(runId: string) {
    const row = await this.db.prepare("SELECT checkpoint_json FROM agent_checkpoints WHERE run_id=?").bind(runId).first<Row>();
    return row ? parse<AgentCheckpoint>(row.checkpoint_json) : null;
  }

  async saveChallenge(value: ChallengeRecord) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_challenges (id,run_id,challenge_json,generation,fingerprint,occurrence,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,json(value),value.generation,value.fingerprint,value.occurrence,value.createdAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const row=await this.db.prepare("SELECT challenge_json FROM agent_challenges WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("challenge did not persist");
      assertImmutable("challenge",pickChallengeIdentity(parse<ChallengeRecord>(row.challenge_json)),pickChallengeIdentity(value));
    } else await this.appendEvent(value.runId,"agent.challenge.classified",value,value.createdAt,value.generation);
  }
  async getChallengeOccurrence(runId: string, fingerprint: string) {
    const row=await this.db.prepare("SELECT COALESCE(MAX(occurrence),0) occurrence FROM agent_challenges WHERE run_id=? AND fingerprint=?")
      .bind(runId,fingerprint).first<Row>();
    return Number(row?.occurrence??0);
  }
  async saveCompletionProposal(value: CompletionProposal) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_completion_proposals (id,run_id,proposal_json,generation,proposed_at)
      SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,json(value),value.generation,value.proposedAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const row=await this.db.prepare("SELECT proposal_json FROM agent_completion_proposals WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("completion proposal did not persist");
      assertImmutable("completion proposal",pickProposalIdentity(parse<CompletionProposal>(row.proposal_json)),pickProposalIdentity(value));
    } else await this.appendEvent(value.runId,"agent.completion.proposed",value,value.proposedAt,value.generation);
  }

  async saveCompletionAcceptance(value: CompletionAcceptance) {
    const result=await this.db.prepare(`INSERT OR IGNORE INTO agent_completion_acceptances (id,run_id,proposal_id,acceptance_json,generation,decided_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(value.id,value.runId,value.proposalId,json(value),value.generation,value.decidedAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const row=await this.db.prepare("SELECT acceptance_json FROM agent_completion_acceptances WHERE id=?").bind(value.id).first<Row>();
      if (!row) throw new Error("completion acceptance did not persist");
      assertImmutable("completion acceptance",pickAcceptanceIdentity(parse<CompletionAcceptance>(row.acceptance_json)),pickAcceptanceIdentity(value));
    } else await this.appendEvent(value.runId,"agent.completion.verifier_decided",value,value.decidedAt,value.generation);
  }

  async acceptContent(value: AcquiredContent) {
    await this.db.prepare(`INSERT OR IGNORE INTO acquired_content
      (acceptance_id,tenant_id,resource_id,candidate_id,canonical_url,content_hash,content_json,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      AND EXISTS (SELECT 1 FROM agent_observations WHERE id=? AND run_id=?)`).bind(
      value.acceptanceId,value.tenantId,value.resourceId,value.candidateId,value.canonicalUrl,value.contentHash,json(canonicalContent(value)),
      value.acceptedAt,value.runId,value.generation,new Date().toISOString(),value.observationId,value.runId
    ).run();
    const row = await this.db.prepare("SELECT content_json FROM acquired_content WHERE acceptance_id=?").bind(value.acceptanceId).first<Row>();
    if (!row) { await this.assertGeneration(value.runId,value.generation); throw new Error("accepted content did not persist"); }
    const persisted=parse<CanonicalAcquiredContent>(row.content_json);
    assertAcquiredIdentity(persisted,value);
    const linked=await this.db.prepare(`INSERT OR IGNORE INTO agent_run_acquired_content
      (run_id,acceptance_id,observation_id,generation,provenance_json,linked_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      AND EXISTS (SELECT 1 FROM agent_observations WHERE id=? AND run_id=?)`).bind(
      value.runId,value.acceptanceId,value.observationId,value.generation,json(runAcquisitionProvenance(value)),value.acceptedAt,
      value.runId,value.generation,new Date().toISOString(),value.observationId,value.runId).run();
    if (Number(linked.meta.changes??0)!==1) {
      await this.assertGeneration(value.runId,value.generation);
      const existingLink=await this.db.prepare("SELECT provenance_json FROM agent_run_acquired_content WHERE run_id=? AND acceptance_id=?")
        .bind(value.runId,value.acceptanceId).first<Row>();
      if (!existingLink) throw new Error("run acquisition provenance did not persist");
      assertImmutable("run acquisition provenance",parse(existingLink.provenance_json),runAcquisitionProvenance(value));
    }
    await this.appendEvent(value.runId,"agent.acquired_content.accepted",value,value.acceptedAt,value.generation);
    return value;
  }

  async getAcceptedContent(runId: string) {
    const result = await this.db.prepare(`SELECT c.content_json,l.provenance_json FROM acquired_content c JOIN agent_run_acquired_content l ON l.acceptance_id=c.acceptance_id
      WHERE l.run_id=? ORDER BY l.linked_at,c.acceptance_id`)
      .bind(runId).all<Row>();
    return result.results.map((row) => ({...parse<CanonicalAcquiredContent>(row.content_json),...parse(row.provenance_json)}) as AcquiredContent);
  }

  async saveBrowserSession(value: BrowserSessionRecord) {
    const result=await this.db.prepare(`INSERT INTO agent_browser_sessions (id,run_id,tenant_id,generation,state,record_json,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      ON CONFLICT(id) DO UPDATE SET state=excluded.state,record_json=excluded.record_json WHERE excluded.generation=agent_browser_sessions.generation`)
      .bind(value.id,value.runId,value.tenantId,value.generation,value.state,json(value),value.createdAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(value.runId,value.generation);
    await this.appendEvent(value.runId,"agent.browser.session_saved",value,value.createdAt,value.generation);
  }

  async saveBrowserContext(value: BrowserContextRecord) {
    const result=await this.db.prepare(`INSERT INTO agent_browser_contexts (id,browser_session_id,run_id,tenant_id,generation,record_json,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)
      ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json WHERE excluded.generation=agent_browser_contexts.generation`)
      .bind(value.id,value.browserSessionId,value.runId,value.tenantId,value.generation,json(value),value.createdAt,value.runId,value.generation,new Date().toISOString()).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(value.runId,value.generation);
    await this.appendEvent(value.runId,"agent.browser.context_saved",value,value.createdAt,value.generation);
  }

  async appendEvent(runId: string, type: string, data: unknown, at = new Date().toISOString(), generation?:number) {
    const eventId = crypto.randomUUID();
    const statement=generation===undefined
      ? this.db.prepare(`INSERT INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
          SELECT ?,?,COALESCE(MAX(sequence),0)+1,?,?,? FROM agent_run_events WHERE run_id=?`).bind(eventId,runId,type,json(data),at,runId)
      : this.db.prepare(`INSERT INTO agent_run_events (event_id,run_id,sequence,type,data_json,created_at)
          SELECT ?,?,(SELECT COALESCE(MAX(sequence),0)+1 FROM agent_run_events WHERE run_id=?),?,?,? WHERE EXISTS
          (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
          .bind(eventId,runId,runId,type,json(data),at,runId,generation,new Date().toISOString());
    const result=await statement.run();
    if (generation!==undefined && Number(result.meta.changes??0)!==1) await this.assertGeneration(runId,generation);
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
    const result=await this.db.prepare(`UPDATE agent_outbox SET state='acknowledged',acknowledged_at=? WHERE run_id=?
      AND EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND state='completed')`).bind(at,runId,runId).run();
    if (Number(result.meta.changes??0)!==1 && (await this.getOutbox(runId))?.state!=="acknowledged") {
      throw new Error("outbox can only be acknowledged for a completed run");
    }
    await this.appendEvent(runId,"agent.outbox.acknowledged",{ runId },at);
  }

  async failRunDelivery(runId:string,reason:string,at=new Date().toISOString()) {
    const run=await this.getRun(runId);
    if (!run || ["completed","failed","cancelled"].includes(run.state)) return;
    const results=await this.db.batch([
      this.db.prepare(`UPDATE agent_runs SET state='failed',generation=generation+1,updated_at=?
        WHERE run_id=? AND state NOT IN ('completed','failed','cancelled')`).bind(at,runId),
      this.db.prepare("DELETE FROM agent_run_leases WHERE run_id=? AND EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND state='failed' AND updated_at=?)").bind(runId,runId,at),
      this.db.prepare(`UPDATE agent_browser_sessions SET state='crashed',record_json=json_set(record_json,'$.state','crashed')
        WHERE run_id=? AND state!='closed' AND EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND state='failed' AND updated_at=?)`).bind(runId,runId,at),
      this.db.prepare(`UPDATE agent_outbox SET state='failed',failed_at=?,failure_reason=?
        WHERE run_id=? AND state!='acknowledged' AND EXISTS (SELECT 1 FROM agent_runs WHERE run_id=? AND state='failed' AND updated_at=?)`).bind(at,reason,runId,runId,at)
    ]);
    if (Number(results[0].meta.changes??0)!==1) return;
    await this.appendEvent(runId,"agent.run.delivery_failed",{reason},at);
  }

  async markOutboxDelivered(runId:string,at=new Date().toISOString()) {
    await this.db.prepare("UPDATE agent_outbox SET state='delivered',delivered_at=?,attempts=attempts+1 WHERE run_id=? AND state='pending'").bind(at,runId).run();
    await this.appendEvent(runId,"agent.outbox.delivered",{runId},at);
  }

  async getOutbox(runId: string) {
    const row = await this.db.prepare("SELECT * FROM agent_outbox WHERE run_id=?").bind(runId).first<Row>();
    if (!row) return null;
    return outboxFromRow(row);
  }

  async listPendingOutbox(limit=25,now=new Date()) {
    const result=await this.db.prepare(`SELECT * FROM agent_outbox WHERE state='pending' AND next_attempt_at<=? ORDER BY created_at LIMIT ?`)
      .bind(now.toISOString(),limit).all<Row>();
    return result.results.map(outboxFromRow);
  }

  async getBudget(runId: string) {
    const row = await this.db.prepare("SELECT budget_json FROM agent_run_budgets WHERE run_id=?").bind(runId).first<Row>();
    return row ? parse<AgentRunBudget>(row.budget_json) : null;
  }

  async saveBudget(value: AgentRunBudget,generation:number) {
    const at = new Date().toISOString();
    const result=await this.db.prepare(`UPDATE agent_run_budgets SET budget_json=?,updated_at=? WHERE run_id=? AND EXISTS
      (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(json(value),at,value.runId,value.runId,generation,at).run();
    if (Number(result.meta.changes??0)!==1) await this.assertGeneration(value.runId,generation);
    await this.appendEvent(value.runId,"agent.budget.updated",value.usage,at,generation);
  }

  async authorizeChallengeResume(runId:string,challengeVersion:number,tokenHash:string,at=new Date().toISOString()) {
    await this.db.batch([this.db.prepare(`INSERT INTO agent_challenge_resume_authorizations (run_id,challenge_version,token_hash,authorized_at)
      VALUES (?,?,?,?) ON CONFLICT(run_id,challenge_version) DO UPDATE SET token_hash=excluded.token_hash,authorized_at=excluded.authorized_at,consumed_at=NULL`)
      .bind(runId,challengeVersion,tokenHash,at),this.db.prepare(`UPDATE agent_outbox SET state='pending',next_attempt_at=?
        WHERE run_id=? AND state IN ('pending','delivered') AND EXISTS
        (SELECT 1 FROM agent_runs WHERE run_id=? AND state='suspended')`).bind(at,runId,runId)]);
  }

  async hasChallengeResumeAuthorization(runId:string) {
    const row=await this.db.prepare(`SELECT 1 ok FROM agent_challenge_resume_authorizations WHERE run_id=? AND consumed_at IS NULL ORDER BY challenge_version DESC LIMIT 1`)
      .bind(runId).first<Row>(); return Boolean(row);
  }

  async consumeChallengeResumeAuthorization(runId:string,generation:number,at=new Date().toISOString()) {
    const result=await this.db.prepare(`UPDATE agent_challenge_resume_authorizations SET consumed_at=? WHERE run_id=? AND consumed_at IS NULL
      AND EXISTS (SELECT 1 FROM agent_run_leases WHERE run_id=? AND generation=? AND expires_at>?)`)
      .bind(at,runId,runId,generation,at).run();
    return Number(result.meta.changes??0)>0;
  }

}

function outboxFromRow(row:Row):AgentOutbox {
  return {id:String(row.id),runId:String(row.run_id),kind:"agent_run_wake",state:row.state as AgentOutbox["state"],createdAt:String(row.created_at),
    acknowledgedAt:row.acknowledged_at?String(row.acknowledged_at):undefined,deliveredAt:row.delivered_at?String(row.delivered_at):undefined,
    attempts:Number(row.attempts),nextAttemptAt:String(row.next_attempt_at),failedAt:row.failed_at?String(row.failed_at):undefined,
    failureReason:row.failure_reason?String(row.failure_reason):undefined};
}

function canonicalContent(value:AcquiredContent):CanonicalAcquiredContent { return {
  acceptanceId:value.acceptanceId,tenantId:value.tenantId,resourceId:value.resourceId,candidateId:value.candidateId,
  canonicalUrl:value.canonicalUrl,publisherTimestamp:value.publisherTimestamp,title:value.title,excerpt:value.excerpt,
  body:value.body,contentHash:value.contentHash
}; }
function runAcquisitionProvenance(value:AcquiredContent) { return {runId:value.runId,acquisitionAttempt:value.acquisitionAttempt,
  generation:value.generation,turnId:value.turnId,modelCallId:value.modelCallId,toolCallId:value.toolCallId,
  observationId:value.observationId,rawArtifactRef:value.rawArtifactRef,finalUrl:value.finalUrl,acceptedAt:value.acceptedAt}; }
function assertAcquiredIdentity(existing:CanonicalAcquiredContent,incoming:AcquiredContent) {
  for (const key of ["tenantId","resourceId","candidateId","canonicalUrl","contentHash"] as const) {
    if (existing[key]!==incoming[key]) throw new Error(`acquired content identity collision on ${key}`);
  }
}

function assertAdmissionIdentity(existing:AgentRun,incoming:AgentRun) {
  const existingIdentity={runId:existing.runId,tenantId:existing.tenantId,resourceId:existing.resourceId,idempotencyKey:existing.idempotencyKey,
    mode:existing.mode,policySnapshotId:existing.policySnapshotId,completionContractVersion:existing.completionContractVersion,candidate:existing.candidate};
  const incomingIdentity={runId:incoming.runId,tenantId:incoming.tenantId,resourceId:incoming.resourceId,idempotencyKey:incoming.idempotencyKey,
    mode:incoming.mode,policySnapshotId:incoming.policySnapshotId,completionContractVersion:incoming.completionContractVersion,candidate:incoming.candidate};
  if (json(existingIdentity)!==json(incomingIdentity)) throw new Error(`agent run identity collision: ${incoming.runId}`);
}

function assertImmutable(label:string,existing:unknown,incoming:unknown) {
  if (json(existing)!==json(incoming)) throw new Error(`${label} identity collision`);
}

function pickTurnIdentity(value:AgentTurn) {
  return {id:value.id,runId:value.runId,sequence:value.sequence,pageStateHash:value.pageStateHash,generation:value.generation};
}
function pickModelCallIdentity(value:AgentModelCall) {
  return {id:value.id,runId:value.runId,turnId:value.turnId,generation:value.generation,role:value.role,route:value.route,
    contextManifestHash:value.contextManifestHash,stableInstructionsHash:value.stableInstructionsHash};
}
function pickToolCallIdentity(value:AgentToolCall) {
  return {id:value.id,runId:value.runId,turnId:value.turnId,modelCallId:value.modelCallId,planIndex:value.planIndex,tool:value.tool,
    arguments:value.arguments,generation:value.generation};
}
function pickPolicyIdentity(value:AgentPolicyDecision) {
  return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,allowed:value.allowed,reasonCode:value.reasonCode,
    policySnapshotId:value.policySnapshotId,generation:value.generation};
}
function pickIntentIdentity(value:AgentToolIntent) {
  return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,generation:value.generation,tool:value.tool,
    idempotencyKey:value.idempotencyKey,arguments:value.arguments};
}
function pickResultIdentity(value:AgentToolResult) {
  return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,generation:value.generation,state:value.state,
    effectCertainty:value.effectCertainty,output:value.output,errorCode:value.errorCode,errorMessage:value.errorMessage};
}
function pickObservationIdentity(value:ObservationEnvelope) {
  return {id:value.id,runId:value.runId,turnId:value.turnId,toolCallId:value.toolCallId,browserSessionId:value.browserSessionId,
    browserGeneration:value.browserGeneration,pageId:value.pageId,pageRevision:value.pageRevision,originUrl:value.originUrl,finalUrl:value.finalUrl,
    contentType:value.contentType,representationType:value.representationType,raw:value.raw,presented:value.presented,
    trustClassification:value.trustClassification};
}
function pickConfigurationIdentity(value:RunConfigurationSnapshot) {
  return {runId:value.runId,candidate:value.candidate,policy:value.policy,modelRouting:value.modelRouting,modelCapabilities:value.modelCapabilities};
}
function pickChallengeIdentity(value:ChallengeRecord) { return {id:value.id,runId:value.runId,observationId:value.observationId,state:value.state,
  fingerprint:value.fingerprint,occurrence:value.occurrence,disposition:value.disposition,generation:value.generation}; }
function pickProposalIdentity(value:CompletionProposal) { return {id:value.id,runId:value.runId,toolCallId:value.toolCallId,
  citedObservationIds:value.citedObservationIds,generation:value.generation}; }
function pickAcceptanceIdentity(value:CompletionAcceptance) { return {id:value.id,runId:value.runId,proposalId:value.proposalId,outcome:value.outcome,
  deficits:value.deficits,generation:value.generation}; }
