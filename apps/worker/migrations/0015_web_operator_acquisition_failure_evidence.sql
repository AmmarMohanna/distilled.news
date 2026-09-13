PRAGMA foreign_keys = ON;

CREATE TABLE web_operator_acquisition_failure_evidence (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  method TEXT NOT NULL,
  failure_class TEXT NOT NULL,
  transient INTEGER NOT NULL CHECK (transient IN (0,1)),
  details_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX web_operator_acquisition_failure_scope_idx
  ON web_operator_acquisition_failure_evidence (tenant_id, resource_id, candidate_id, occurred_at);
