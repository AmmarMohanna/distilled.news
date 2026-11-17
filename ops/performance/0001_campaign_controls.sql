-- Explicit opt-in migration for a NEW isolated campaign database only.
-- Not part of the application's default migration directory.
CREATE TABLE IF NOT EXISTS agentops_campaign_feeds (
 feed_id TEXT PRIMARY KEY,
 run_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 interrupt_until TEXT
);
CREATE INDEX IF NOT EXISTS agentops_campaign_run ON agentops_campaign_feeds(run_id,feed_id);

CREATE INDEX IF NOT EXISTS agentops_campaign_owner ON agentops_campaign_feeds(run_id,owner_id,feed_id);
