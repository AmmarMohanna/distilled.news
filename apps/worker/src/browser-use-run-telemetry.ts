import type { Env } from "./types";

export type BrowserUseRunState = "RUNNING" | "PROPOSAL_ACCEPTED" | "VERIFIED" | "CANDIDATE" | "VALIDATED" | "ACTIVE" | "FAILED";
export type BrowserUseRunOutcome = "SUCCESS" | "INSUFFICIENT" | "STRUCTURAL_FAILURE" | "POLICY_DENIED" | "CHALLENGE_REQUIRED" | "AUTH_REQUIRED" | "TRANSIENT_FAILURE" | "TIMEOUT" | "CANCELLED";

const bounded = (value: number | undefined, maximum: number): number | null =>
  value === undefined || !Number.isInteger(value) || value < 0 ? null : Math.min(value, maximum);

/** Only typed counters and timing are persisted. No task text, URLs, model output, or session data. */
export class D1BrowserUseRunTelemetry {
  constructor(private readonly db: Env["DB"]) {}

  async begin(input: { runId: string; acquisitionRunId: string; tenantId: string; resourceId: string; startedAt: string }): Promise<void> {
    await this.db.prepare(`INSERT OR IGNORE INTO browser_use_discovery_runs
      (run_id,acquisition_run_id,tenant_id,resource_id,state,started_at) VALUES (?,?,?,?,'RUNNING',?)`)
      .bind(input.runId,input.acquisitionRunId,input.tenantId,input.resourceId,input.startedAt).run();
  }

  async stage(runId: string, state: BrowserUseRunState, input: { modelCalls?: number; browserOperations?: number; agentBrowserActions?: number; agentDurationMs?: number; verificationDurationMs?: number;decisionMode?:string;jevCalls?:number;decisionFallbacks?:number } = {}): Promise<void> {
    await this.db.prepare(`UPDATE browser_use_discovery_runs SET state=?,
      discovery_model_calls=COALESCE(?,discovery_model_calls),
      browser_operations=COALESCE(?,browser_operations),
      agent_browser_actions=COALESCE(?,agent_browser_actions),
      agent_duration_ms=COALESCE(?,agent_duration_ms),
      verification_duration_ms=COALESCE(?,verification_duration_ms)
      ,decision_mode=COALESCE(?,decision_mode),jev_calls=COALESCE(?,jev_calls),decision_fallbacks=COALESCE(?,decision_fallbacks)
      WHERE run_id=? AND completed_at IS NULL`)
      .bind(state,bounded(input.modelCalls,32),bounded(input.browserOperations,128),bounded(input.agentBrowserActions,64),bounded(input.agentDurationMs,600000),bounded(input.verificationDurationMs,600000),input.decisionMode??null,bounded(input.jevCalls,5),bounded(input.decisionFallbacks,5),runId).run();
  }

  async completeAcquisition(acquisitionRunId: string, outcome: BrowserUseRunOutcome, completedAt = new Date().toISOString()): Promise<void> {
    await this.db.prepare(`UPDATE browser_use_discovery_runs SET outcome=?, completed_at=?,
      jev_calls=(SELECT COUNT(*) FROM bounded_decision_events WHERE bounded_decision_events.run_id=browser_use_discovery_runs.run_id),
      total_duration_ms=MIN(600000,MAX(0,ROUND((julianday(?) - julianday(started_at))*86400000))),
      state=CASE WHEN state IN ('ACTIVE','VALIDATED','CANDIDATE','VERIFIED') THEN state ELSE 'FAILED' END
      WHERE acquisition_run_id=? AND completed_at IS NULL`)
      .bind(outcome,completedAt,completedAt,acquisitionRunId).run();
  }

  async get(runId: string): Promise<Record<string, unknown> | null> {
    return this.db.prepare(`SELECT run_id AS runId,acquisition_run_id AS acquisitionRunId,tenant_id AS tenantId,resource_id AS resourceId,
      state,outcome,browser_use_discovery_runs AS browserUseDiscoveryRuns,discovery_model_calls AS discoveryModelCalls,
      browser_operations AS browserOperations,agent_browser_actions AS agentBrowserActions,started_at AS startedAt,
      completed_at AS completedAt,total_duration_ms AS totalDurationMs,agent_duration_ms AS agentDurationMs,
      verification_duration_ms AS verificationDurationMs,decision_mode AS decisionMode,jev_calls AS jevCalls,decision_fallbacks AS decisionFallbacks,
      (SELECT COUNT(*) FROM bounded_decision_events d WHERE d.run_id=browser_use_discovery_runs.run_id AND d.outcome IN ('SELECTED','EXECUTED','STOPPED','STALE','EXECUTION_FAILED')) AS jevSuccessfulChoices,
      (SELECT COUNT(*) FROM bounded_decision_events d WHERE d.run_id=browser_use_discovery_runs.run_id AND d.outcome='EXECUTED') AS jevExecutedActions,
      (SELECT SUM(cost_usd) FROM bounded_decision_events d WHERE d.run_id=browser_use_discovery_runs.run_id) AS jevCostUsd
      FROM browser_use_discovery_runs WHERE run_id=?`).bind(runId).first<Record<string, unknown>>();
  }
}
