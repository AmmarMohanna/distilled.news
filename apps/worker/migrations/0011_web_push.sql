CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subscription_json TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  last_notified_at TEXT NOT NULL,
  lease_until TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_account ON push_subscriptions(account_id);
