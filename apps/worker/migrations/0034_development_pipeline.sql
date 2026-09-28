ALTER TABLE raw_messages ADD COLUMN news_json TEXT;
ALTER TABLE briefing_items ADD COLUMN development_json TEXT;
ALTER TABLE briefing_item_evidence ADD COLUMN document_id TEXT;
ALTER TABLE briefing_item_evidence ADD COLUMN content_hash TEXT;
ALTER TABLE briefing_item_evidence ADD COLUMN headline TEXT;
ALTER TABLE processing_jobs ADD COLUMN lease_until TEXT;
ALTER TABLE processing_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN result_json TEXT;
CREATE INDEX processing_jobs_feed_lease_idx ON processing_jobs(briefing_id,lease_until);
ALTER TABLE llm_usage_events ADD COLUMN provider TEXT;
ALTER TABLE llm_usage_events ADD COLUMN phase TEXT;
ALTER TABLE llm_usage_events ADD COLUMN outcome TEXT;
ALTER TABLE llm_usage_events ADD COLUMN latency_ms INTEGER;
ALTER TABLE llm_usage_events ADD COLUMN reported_cost_usd REAL;

-- Account-level cross-feed acknowledgement; generation never advances this boundary.
CREATE TABLE account_catchups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  boundary_start TEXT NOT NULL,
  boundary_end TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  acknowledged_at TEXT,
  UNIQUE(account_id,boundary_start,boundary_end,fingerprint)
);
CREATE INDEX account_catchups_owner_idx ON account_catchups(account_id,created_at);
CREATE TABLE account_development_reads (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES briefing_items(id) ON DELETE CASCADE,
  read_version INTEGER NOT NULL,
  read_through_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(account_id,item_id)
);
