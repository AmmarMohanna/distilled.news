CREATE TABLE IF NOT EXISTS authenticated_browser_challenges (
  challenge_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  bootstrap_request_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES authenticated_site_profiles(id) ON DELETE CASCADE,
  profile_version INTEGER NOT NULL,
  browser_generation INTEGER NOT NULL,
  auth_flow_id TEXT NOT NULL,
  challenge_kind TEXT NOT NULL CHECK (challenge_kind IN ('CAPTCHA','MFA','EMAIL_VERIFICATION','SECURITY_CHALLENGE','UNKNOWN')),
  challenge_phase TEXT NOT NULL CHECK (challenge_phase IN ('PRE_IDENTIFIER','POST_IDENTIFIER','PRE_PASSWORD','POST_PASSWORD','UNKNOWN')),
  provider_kind TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempt_budget INTEGER NOT NULL CHECK (attempt_budget = 1),
  attempt_number INTEGER NOT NULL DEFAULT 0 CHECK (attempt_number BETWEEN 0 AND attempt_budget),
  state TEXT NOT NULL CHECK (state IN ('DETECTED','RESOLUTION_REQUESTED','RESOLVING','RESOLVED','FAILED','UNSUPPORTED','EXPIRED','CANCELLED')),
  provider_operation_id TEXT,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  resolution_outcome TEXT,
  subsequent_surface_kind TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (bootstrap_request_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS authenticated_browser_challenges_request
  ON authenticated_browser_challenges(bootstrap_request_id,state,updated_at);
