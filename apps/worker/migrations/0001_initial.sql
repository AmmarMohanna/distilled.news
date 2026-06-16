CREATE TABLE IF NOT EXISTS briefings (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  interest_profile TEXT NOT NULL,
  style_instruction TEXT,
  public_feed_enabled INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  language TEXT NOT NULL DEFAULT 'en',
  retention_days INTEGER NOT NULL DEFAULT 15,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_sources (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('channel', 'group')),
  username TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS raw_messages (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES telegram_sources(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  text TEXT NOT NULL,
  links_json TEXT NOT NULL,
  media_json TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source_url TEXT,
  raw_payload_key TEXT,
  expires_at TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_raw_messages_source ON raw_messages(source_id);
CREATE INDEX IF NOT EXISTS idx_raw_messages_expires ON raw_messages(expires_at);

CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefing_items (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  item_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  merged_update_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_briefing_items_slug_time ON briefing_items(briefing_id, item_at);
CREATE INDEX IF NOT EXISTS idx_briefing_items_expires ON briefing_items(expires_at);

CREATE TABLE IF NOT EXISTS briefing_item_evidence (
  id TEXT PRIMARY KEY,
  briefing_item_id TEXT NOT NULL REFERENCES briefing_items(id) ON DELETE CASCADE,
  raw_message_id TEXT NOT NULL REFERENCES raw_messages(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('channel', 'group')),
  source_url TEXT,
  posted_at TEXT NOT NULL,
  text TEXT NOT NULL,
  links_json TEXT NOT NULL,
  media_json TEXT NOT NULL,
  UNIQUE (briefing_item_id, raw_message_id)
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  raw_message_id TEXT NOT NULL REFERENCES raw_messages(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('queued', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_state ON processing_jobs(state);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
