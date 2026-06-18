ALTER TABLE briefings ADD COLUMN intensity TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE briefing_item_evidence ADD COLUMN source_provider TEXT;
ALTER TABLE briefing_item_evidence ADD COLUMN source_kind TEXT;
ALTER TABLE raw_messages ADD COLUMN source_title TEXT;
ALTER TABLE raw_messages ADD COLUMN source_type TEXT;
ALTER TABLE raw_messages ADD COLUMN source_provider TEXT;
ALTER TABLE raw_messages ADD COLUMN source_kind TEXT;
ALTER TABLE raw_messages ADD COLUMN source_username TEXT;

ALTER TABLE telegram_sources RENAME TO sources;

ALTER TABLE sources ADD COLUMN provider TEXT NOT NULL DEFAULT 'telegram';
ALTER TABLE sources ADD COLUMN kind TEXT NOT NULL DEFAULT 'telegram_channel';
ALTER TABLE sources ADD COLUMN input TEXT;
ALTER TABLE sources ADD COLUMN source_url TEXT;
ALTER TABLE sources ADD COLUMN actor_id TEXT;
ALTER TABLE sources ADD COLUMN actor_input_json TEXT;
ALTER TABLE sources ADD COLUMN cursor_json TEXT;
ALTER TABLE sources ADD COLUMN last_checked_at TEXT;
ALTER TABLE sources ADD COLUMN last_error TEXT;

UPDATE sources
SET
  provider = 'telegram',
  kind = CASE WHEN type = 'group' THEN 'telegram_group' ELSE 'telegram_channel' END,
  input = CASE WHEN username IS NOT NULL THEN 'https://t.me/' || username ELSE title END,
  source_url = CASE WHEN username IS NOT NULL THEN 'https://t.me/' || username ELSE NULL END;

CREATE TABLE IF NOT EXISTS source_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  actor_id TEXT,
  actor_run_id TEXT,
  dataset_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
  item_count INTEGER NOT NULL DEFAULT 0,
  archive_key TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_runs_state ON source_runs(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source_id, updated_at);
