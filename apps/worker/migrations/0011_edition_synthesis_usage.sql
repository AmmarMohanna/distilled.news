CREATE TABLE llm_usage_events_v2 (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('summary', 'importance_review', 'event_review', 'edition_summary')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

INSERT INTO llm_usage_events_v2 (
  id, briefing_id, model, purpose, input_tokens, output_tokens, estimated_cost_usd, created_at
)
SELECT id, briefing_id, model, purpose, input_tokens, output_tokens, estimated_cost_usd, created_at
FROM llm_usage_events;

DROP TABLE llm_usage_events;
ALTER TABLE llm_usage_events_v2 RENAME TO llm_usage_events;
CREATE INDEX idx_llm_usage_events_briefing_time ON llm_usage_events(briefing_id, created_at);
