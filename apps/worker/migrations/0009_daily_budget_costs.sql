ALTER TABLE briefings ADD COLUMN daily_budget_usd REAL NOT NULL DEFAULT 1.0;

ALTER TABLE source_runs ADD COLUMN estimated_cost_usd REAL;
ALTER TABLE source_runs ADD COLUMN actual_cost_usd REAL;

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('summary', 'importance_review', 'event_review')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_briefing_time ON llm_usage_events(briefing_id, created_at);
