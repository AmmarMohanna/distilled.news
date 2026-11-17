PRAGMA foreign_keys = ON;

CREATE TABLE web_operator_workflow_failure_evidence (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES web_operator_workflows(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  failure_class TEXT NOT NULL,
  transient INTEGER NOT NULL CHECK (transient IN (0,1)),
  operation_id TEXT,
  details_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE INDEX web_operator_workflow_failure_resource_idx
  ON web_operator_workflow_failure_evidence (resource_id, observed_at);

CREATE INDEX web_operator_workflow_failure_workflow_idx
  ON web_operator_workflow_failure_evidence (workflow_id, observed_at);
