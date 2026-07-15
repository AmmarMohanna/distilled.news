ALTER TABLE sources ADD COLUMN canonical_key TEXT;

UPDATE sources
SET canonical_key = lower(provider || '|' || kind || '|' || trim(COALESCE(username, source_url, input, title)))
WHERE canonical_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_canonical_key
  ON sources(canonical_key, enabled);

CREATE TABLE IF NOT EXISTS canonical_source_refreshes (
  canonical_key TEXT PRIMARY KEY,
  lease_token TEXT,
  lease_until TEXT,
  next_refresh_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canonical_source_refreshes_due
  ON canonical_source_refreshes(next_refresh_at, lease_until);

