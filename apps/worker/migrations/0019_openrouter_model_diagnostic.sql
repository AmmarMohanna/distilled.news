CREATE TABLE IF NOT EXISTS openrouter_model_diagnostic_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','queued','running','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  requested_model TEXT,
  requested_provider TEXT,
  stopped_at_stage TEXT CHECK (stopped_at_stage IS NULL OR stopped_at_stage IN ('A','B','C','D','E','F')),
  result_json TEXT,
  failure_class TEXT,
  created_at TEXT NOT NULL,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_openrouter_model_diagnostic_pending
  ON openrouter_model_diagnostic_requests (state, created_at);
