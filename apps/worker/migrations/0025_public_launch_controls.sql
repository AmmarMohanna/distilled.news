ALTER TABLE accounts ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE accounts ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE accounts ADD COLUMN terms_version TEXT;
ALTER TABLE accounts ADD COLUMN privacy_version TEXT;

ALTER TABLE source_runs ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_runs_idempotency
  ON source_runs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_source_runs_terminal_retention
  ON source_runs(state, completed_at, archive_key);

CREATE TABLE IF NOT EXISTS spend_ledger (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  account_id TEXT NOT NULL,
  briefing_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('collection', 'llm')),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('reservation', 'settlement', 'release')),
  amount_usd REAL NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (idempotency_key, event_type)
);

CREATE INDEX IF NOT EXISTS idx_spend_ledger_account_category_time
  ON spend_ledger(account_id, category, created_at);

CREATE INDEX IF NOT EXISTS idx_spend_ledger_category_time
  ON spend_ledger(category, created_at);

CREATE TRIGGER IF NOT EXISTS spend_ledger_no_update
BEFORE UPDATE ON spend_ledger
BEGIN
  SELECT RAISE(ABORT, 'spend ledger is append-only');
END;

CREATE TRIGGER IF NOT EXISTS spend_ledger_no_delete
BEFORE DELETE ON spend_ledger
BEGIN
  SELECT RAISE(ABORT, 'spend ledger is append-only');
END;

DELETE FROM briefing_stars
WHERE NOT EXISTS (
  SELECT 1
  FROM accounts
  WHERE accounts.id = briefing_stars.voter_id
);

UPDATE briefings
SET stars = (
  SELECT COUNT(*)
  FROM briefing_stars
  WHERE briefing_stars.briefing_id = briefings.id
);

CREATE TRIGGER IF NOT EXISTS briefing_stars_recount_after_delete
AFTER DELETE ON briefing_stars
BEGIN
  UPDATE briefings
  SET stars = (
    SELECT COUNT(*)
    FROM briefing_stars
    WHERE briefing_stars.briefing_id = OLD.briefing_id
  )
  WHERE id = OLD.briefing_id;
END;

UPDATE sources
SET canonical_key = (
  SELECT briefings.owner_account_id || '|' || sources.canonical_key
  FROM briefings
  WHERE briefings.id = sources.briefing_id
)
WHERE sources.kind IN ('google_news', 'x_profile', 'x_search')
  AND sources.canonical_key IS NOT NULL;

DELETE FROM canonical_source_refreshes
WHERE canonical_key NOT IN (
  SELECT canonical_key
  FROM sources
  WHERE canonical_key IS NOT NULL
);

UPDATE sources
SET
  health_state = 'degraded',
  failure_class = COALESCE(failure_class, 'pending_first_success')
WHERE enabled = 1
  AND last_success_at IS NULL
  AND health_state = 'healthy';

CREATE INDEX IF NOT EXISTS idx_briefings_due_publication
  ON briefings(paused, next_briefing_at);

CREATE INDEX IF NOT EXISTS idx_briefing_editions_explore
  ON briefing_editions(briefing_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_sources_briefing_kind
  ON sources(briefing_id, kind);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_briefing_state
  ON processing_jobs(briefing_id, state);

CREATE INDEX IF NOT EXISTS idx_briefing_windows_recovery
  ON briefing_windows(state, recovery_attempted_at, window_end, briefing_id);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_action_time_key
  ON auth_attempts(action, created_at, key);

CREATE TABLE IF NOT EXISTS operational_events (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('maintenance', 'dlq', 'model')),
  subsystem TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  body_type TEXT,
  body_id TEXT,
  release_sha TEXT,
  detail TEXT,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operational_events_time
  ON operational_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_events_category_status_time
  ON operational_events(category, status, occurred_at DESC);
