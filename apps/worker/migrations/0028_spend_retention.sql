DROP TRIGGER IF EXISTS spend_ledger_no_delete;

CREATE TABLE IF NOT EXISTS spend_daily_aggregates (
  day TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('collection', 'llm')),
  provider TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  operation_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, category, provider)
);

CREATE INDEX IF NOT EXISTS idx_spend_daily_aggregates_day
  ON spend_daily_aggregates(day);

CREATE TABLE IF NOT EXISTS spend_idempotency_tombstones (
  idempotency_key_hash TEXT PRIMARY KEY,
  first_created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spend_idempotency_tombstones_expiry
  ON spend_idempotency_tombstones(expires_at);

CREATE TABLE IF NOT EXISTS spend_retention_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  lease_token TEXT,
  lease_until TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO spend_retention_lease (id, updated_at)
VALUES (1, '1970-01-01T00:00:00.000Z');
