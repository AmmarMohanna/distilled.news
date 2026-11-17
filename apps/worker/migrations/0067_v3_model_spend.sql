-- V3 briefing model spend ledger. One row per provider call attempt. A row is reserved at its
-- worst-case cost BEFORE the call, settled to the actual cost afterwards, and released only when
-- the provider definitely refused the request. A call whose outcome is unknown (timeout, dropped
-- connection, crashed worker) stays held at its worst case and keeps counting against the rolling
-- window, so an uncertain outcome can never silently free budget.
CREATE TABLE IF NOT EXISTS v3_model_spend (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  model TEXT NOT NULL,
  reserved_usd REAL NOT NULL CHECK (reserved_usd >= 0),
  settled_usd REAL CHECK (settled_usd IS NULL OR settled_usd >= 0),
  state TEXT NOT NULL CHECK (state IN ('held', 'settled', 'released')),
  outcome TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_v3_model_spend_created ON v3_model_spend(created_at);

CREATE INDEX IF NOT EXISTS idx_v3_model_spend_run ON v3_model_spend(run_id);
