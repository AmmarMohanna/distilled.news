CREATE TABLE IF NOT EXISTS authenticated_x_acquisition_requests (
  request_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  owner_account_id TEXT NOT NULL,
  authenticated_profile_id TEXT NOT NULL,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','queued','running','completed','failed')),
  outcome TEXT,
  result_json TEXT,
  failure_class TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS authenticated_x_acquisition_pending_idx ON authenticated_x_acquisition_requests(state,created_at);
