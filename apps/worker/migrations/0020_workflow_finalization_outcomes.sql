PRAGMA foreign_keys = ON;

CREATE TABLE web_operator_workflow_finalization_outcomes (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('PROMOTED','NOT_PROMOTED')),
  reason TEXT,
  workflow_id TEXT REFERENCES web_operator_workflows(id) ON DELETE SET NULL,
  outcome_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX web_operator_workflow_finalization_state_idx
  ON web_operator_workflow_finalization_outcomes (state, recorded_at);
