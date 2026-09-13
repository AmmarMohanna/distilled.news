PRAGMA foreign_keys = ON;

CREATE TABLE web_operator_workflow_captures (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  bundle_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX web_operator_workflow_captures_resource_idx
  ON web_operator_workflow_captures (tenant_id, resource_id, created_at);

CREATE TABLE web_operator_workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  source_capture_id TEXT NOT NULL REFERENCES web_operator_workflow_captures(id) ON DELETE RESTRICT,
  candidate_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('CANDIDATE','VALIDATED','ACTIVE','SUPERSEDED','REJECTED','INVALID','ROLLED_BACK')),
  version INTEGER NOT NULL CHECK (version > 0),
  workflow_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  validated_at TEXT,
  activated_at TEXT,
  superseded_by TEXT REFERENCES web_operator_workflows(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, resource_id, version)
);

CREATE UNIQUE INDEX web_operator_workflows_one_active_idx
  ON web_operator_workflows (tenant_id, resource_id)
  WHERE state = 'ACTIVE';

CREATE INDEX web_operator_workflows_resource_state_idx
  ON web_operator_workflows (tenant_id, resource_id, state, version DESC);

CREATE TABLE web_operator_workflow_validations (
  workflow_id TEXT PRIMARY KEY REFERENCES web_operator_workflows(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  passed INTEGER NOT NULL CHECK (passed IN (0,1)),
  failure_class TEXT,
  validated_at TEXT NOT NULL
);

CREATE TABLE web_operator_workflow_lifecycle_events (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES web_operator_workflows(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  authority TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE web_operator_evaluation_metrics (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  candidate_id TEXT,
  metrics_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX web_operator_evaluation_metrics_resource_idx
  ON web_operator_evaluation_metrics (resource_id, recorded_at);
