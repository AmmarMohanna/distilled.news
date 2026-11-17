CREATE TABLE IF NOT EXISTS web_operator_live_smoke_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  candidate_url TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','queued','running','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  run_id TEXT,
  outcome_state TEXT,
  failure_class TEXT,
  created_at TEXT NOT NULL,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_operator_live_smoke_pending
  ON web_operator_live_smoke_requests (state, created_at);
