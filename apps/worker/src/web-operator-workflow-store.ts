import type {
  AcquisitionEvaluationMetrics,
  EvaluationSink,
  WorkflowCaptureBundle,
  WorkflowCandidate,
  WorkflowFailureEvidence,
  WorkflowRepository,
  WorkflowValidationResult,
  WorkflowLifecycleState
} from "@distilled/agent-runtime";
import { makeId } from "@distilled/agent-runtime";

type Row = Record<string, unknown>;

const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: unknown): T => JSON.parse(String(value)) as T;

export class D1WorkflowRepository implements WorkflowRepository, EvaluationSink {
  constructor(private readonly db: D1Database) {}

  async saveCaptureBundle(bundle: WorkflowCaptureBundle): Promise<void> {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO web_operator_workflow_captures
      (id,run_id,tenant_id,resource_id,bundle_json,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(bundle.id,bundle.runId,bundle.tenantId,bundle.resourceId,json(bundle),bundle.createdAt).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      const existing = await this.getCaptureBundle(bundle.id);
      if (!existing || json(captureIdentity(existing)) !== json(captureIdentity(bundle))) {
        throw new Error(`workflow capture identity collision: ${bundle.id}`);
      }
    }
  }

  async getCaptureBundle(id: string): Promise<WorkflowCaptureBundle | null> {
    const row = await this.db.prepare("SELECT bundle_json FROM web_operator_workflow_captures WHERE id=?").bind(id).first<Row>();
    return row ? parse<WorkflowCaptureBundle>(row.bundle_json) : null;
  }

  async saveWorkflowCandidate(candidate: WorkflowCandidate): Promise<void> {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO web_operator_workflows
      (id,tenant_id,resource_id,source_capture_id,candidate_json,state,version,workflow_json,created_at,validated_at,activated_at,superseded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      candidate.id,candidate.tenantId,candidate.resourceId,candidate.sourceCaptureId,json(candidate.candidate),candidate.state,
      candidate.version,json(candidate),candidate.createdAt,candidate.validatedAt ?? null,candidate.activatedAt ?? null,candidate.supersededBy ?? null
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      const existing = await this.getWorkflowCandidate(candidate.id);
      if (!existing || json(workflowIdentity(existing)) !== json(workflowIdentity(candidate))) {
        throw new Error(`workflow candidate identity collision: ${candidate.id}`);
      }
    }
  }

  async getWorkflowCandidate(id: string): Promise<WorkflowCandidate | null> {
    const row = await this.db.prepare("SELECT workflow_json,state,validated_at,activated_at,superseded_by FROM web_operator_workflows WHERE id=?")
      .bind(id).first<Row>();
    return row ? workflowFromRow(row) : null;
  }

  async listWorkflowCandidates(resourceId: string): Promise<WorkflowCandidate[]> {
    const result = await this.db.prepare("SELECT workflow_json,state,validated_at,activated_at,superseded_by FROM web_operator_workflows WHERE resource_id=? ORDER BY version DESC")
      .bind(resourceId).all<Row>();
    return result.results.map(workflowFromRow);
  }

  async getActiveWorkflow(resourceId: string): Promise<WorkflowCandidate | null> {
    const row = await this.db.prepare(`SELECT workflow_json,state,validated_at,activated_at,superseded_by
      FROM web_operator_workflows WHERE resource_id=? AND state='ACTIVE' ORDER BY version DESC LIMIT 1`)
      .bind(resourceId).first<Row>();
    return row ? workflowFromRow(row) : null;
  }

  async saveValidationResult(result: WorkflowValidationResult): Promise<void> {
    const write = await this.db.batch([
      this.db.prepare(`INSERT INTO web_operator_workflow_validations
        (workflow_id,result_json,passed,failure_class,validated_at)
        VALUES (?,?,?,?,?)
        ON CONFLICT(workflow_id) DO UPDATE SET result_json=excluded.result_json,passed=excluded.passed,
          failure_class=excluded.failure_class,validated_at=excluded.validated_at`)
        .bind(result.workflowId,json(result),result.passed ? 1 : 0,result.failureClass ?? null,result.validatedAt),
      this.db.prepare(`UPDATE web_operator_workflows SET state=?,validated_at=?,workflow_json=json_set(workflow_json,'$.state',?,'$.validatedAt',?)
        WHERE id=? AND state IN ('CANDIDATE','VALIDATED','INVALID')`)
        .bind(result.passed ? "VALIDATED" : "INVALID",result.validatedAt,result.passed ? "VALIDATED" : "INVALID",result.validatedAt,result.workflowId)
    ]);
    if (Number(write[1].meta.changes ?? 0) !== 1) throw new Error(`workflow validation target not found or not mutable: ${result.workflowId}`);
    await this.recordLifecycle(result.workflowId, undefined, result.passed ? "VALIDATED" : "INVALID", "workflow-validator", result.failureClass);
  }

  async saveFailureEvidence(evidence: WorkflowFailureEvidence): Promise<void> {
    const result = await this.db.prepare(`INSERT OR IGNORE INTO web_operator_workflow_failure_evidence
      (id,workflow_id,resource_id,failure_class,transient,operation_id,details_json,observed_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
      evidence.id,evidence.workflowId,evidence.resourceId,evidence.failureClass,evidence.transient ? 1 : 0,
      evidence.operationId ?? null,json(evidence.details),evidence.observedAt
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      const existing = (await this.listFailureEvidence(evidence.workflowId)).find((entry) => entry.id === evidence.id);
      if (!existing || json(existing) !== json(evidence)) throw new Error(`workflow failure evidence identity collision: ${evidence.id}`);
    }
  }

  async listFailureEvidence(workflowId: string): Promise<WorkflowFailureEvidence[]> {
    const result = await this.db.prepare(`SELECT * FROM web_operator_workflow_failure_evidence
      WHERE workflow_id=? ORDER BY observed_at ASC`).bind(workflowId).all<Row>();
    return result.results.map((row) => ({
      id: String(row.id),
      workflowId: String(row.workflow_id),
      resourceId: String(row.resource_id),
      failureClass: row.failure_class as WorkflowFailureEvidence["failureClass"],
      transient: Boolean(row.transient),
      operationId: row.operation_id ? String(row.operation_id) : undefined,
      details: parse<Record<string, unknown>>(row.details_json),
      observedAt: String(row.observed_at)
    }));
  }

  async promoteWorkflow(workflowId: string, validatorId: string, now = new Date().toISOString()): Promise<WorkflowCandidate> {
    const workflow = await this.getWorkflowCandidate(workflowId);
    if (!workflow) throw new Error(`workflow not found: ${workflowId}`);
    if (workflow.state !== "VALIDATED") throw new Error("only VALIDATED workflows can be promoted");
    await this.db.batch([
      this.db.prepare(`UPDATE web_operator_workflows SET state='SUPERSEDED',superseded_by=?,workflow_json=json_set(workflow_json,'$.state','SUPERSEDED','$.supersededBy',?)
        WHERE tenant_id=? AND resource_id=? AND state='ACTIVE'`).bind(workflowId,workflowId,workflow.tenantId,workflow.resourceId),
      this.db.prepare(`UPDATE web_operator_workflows SET state='ACTIVE',activated_at=?,workflow_json=json_set(workflow_json,'$.state','ACTIVE','$.activatedAt',?)
        WHERE id=? AND state='VALIDATED'`).bind(now,now,workflowId)
    ]);
    await this.recordLifecycle(workflowId, "VALIDATED", "ACTIVE", validatorId, "promotion");
    const promoted = await this.getWorkflowCandidate(workflowId);
    if (!promoted || promoted.state !== "ACTIVE") throw new Error(`workflow promotion failed: ${workflowId}`);
    return promoted;
  }

  async markWorkflow(workflowId: string, state: Extract<WorkflowLifecycleState, "REJECTED" | "INVALID" | "ROLLED_BACK">, now = new Date().toISOString()): Promise<WorkflowCandidate> {
    const result = await this.db.prepare(`UPDATE web_operator_workflows SET state=?,workflow_json=json_set(workflow_json,'$.state',?)
      WHERE id=? AND state IN ('CANDIDATE','VALIDATED','ACTIVE','INVALID','ROLLED_BACK')`)
      .bind(state,state,workflowId).run();
    if (Number(result.meta.changes ?? 0) !== 1) throw new Error(`workflow not found or not mutable: ${workflowId}`);
    await this.recordLifecycle(workflowId, undefined, state, "workflow-authority", now);
    const workflow = await this.getWorkflowCandidate(workflowId);
    if (!workflow) throw new Error(`workflow not found after mark: ${workflowId}`);
    return workflow;
  }

  async recordMetrics(metrics: AcquisitionEvaluationMetrics): Promise<void> {
    await this.db.prepare(`INSERT INTO web_operator_evaluation_metrics
      (id,run_id,resource_id,candidate_id,metrics_json,recorded_at) VALUES (?,?,?,?,?,?)`)
      .bind(makeId("evaluation_metric",metrics.runId,metrics.recordedAt),metrics.runId,metrics.resourceId,
        metrics.candidateId ?? null,json(metrics),metrics.recordedAt).run();
  }

  private async recordLifecycle(workflowId: string, from: WorkflowLifecycleState | undefined, to: WorkflowLifecycleState, authority: string, reason?: string) {
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT INTO web_operator_workflow_lifecycle_events
      (id,workflow_id,from_state,to_state,authority,reason,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(makeId("workflow_lifecycle",workflowId,to,now),workflowId,from ?? null,to,authority,reason ?? null,now).run();
  }
}

function workflowFromRow(row: Row): WorkflowCandidate {
  return {
    ...parse<WorkflowCandidate>(row.workflow_json),
    state: row.state as WorkflowCandidate["state"],
    validatedAt: row.validated_at ? String(row.validated_at) : undefined,
    activatedAt: row.activated_at ? String(row.activated_at) : undefined,
    supersededBy: row.superseded_by ? String(row.superseded_by) : undefined
  };
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
