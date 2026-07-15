ALTER TABLE processing_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE processing_jobs ADD COLUMN lease_until TEXT;
ALTER TABLE processing_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE processing_jobs ADD COLUMN available_at TEXT;
ALTER TABLE processing_jobs ADD COLUMN completed_at TEXT;
ALTER TABLE processing_jobs ADD COLUMN last_enqueued_at TEXT;

UPDATE processing_jobs SET available_at = created_at WHERE available_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_processing_jobs_claim
  ON processing_jobs(state, available_at, lease_until, updated_at);

ALTER TABLE sources ADD COLUMN health_state TEXT NOT NULL DEFAULT 'healthy';
ALTER TABLE sources ADD COLUMN failure_class TEXT;
ALTER TABLE sources ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sources ADD COLUMN last_success_at TEXT;
ALTER TABLE sources ADD COLUMN last_new_item_at TEXT;
ALTER TABLE sources ADD COLUMN next_retry_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sources_due_health
  ON sources(enabled, health_state, next_retry_at, last_checked_at);

CREATE TABLE IF NOT EXISTS processing_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
  lease_token TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'released', 'failed')),
  error TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_processing_attempts_job
  ON processing_attempts(job_id, started_at DESC);

CREATE TABLE IF NOT EXISTS briefing_windows (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('hourly', 'daily', 'weekly', 'monthly')),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'published', 'empty', 'failed')),
  lease_token TEXT,
  lease_until TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  edition_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(briefing_id, cadence, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS idx_briefing_windows_claim
  ON briefing_windows(briefing_id, state, lease_until, window_end);

