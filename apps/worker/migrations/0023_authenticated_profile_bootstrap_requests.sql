CREATE TABLE authenticated_profile_bootstrap_requests (
  request_id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK(operation='AUTHENTICATION_BOOTSTRAP'),
  profile_id TEXT NOT NULL REFERENCES authenticated_site_profiles(id) ON DELETE RESTRICT,
  expected_profile_version INTEGER NOT NULL,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','queued','running','completed','failed','expired','cancelled')),
  attempt_budget INTEGER NOT NULL DEFAULT 1 CHECK(attempt_budget=1),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  browser_generation INTEGER,
  outcome_state TEXT,
  outcome_reason TEXT,
  failure_code TEXT,
  safe_diagnostic_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX authenticated_profile_bootstrap_pending ON authenticated_profile_bootstrap_requests(state,expires_at,created_at);
CREATE INDEX authenticated_profile_bootstrap_profile ON authenticated_profile_bootstrap_requests(profile_id,created_at);
