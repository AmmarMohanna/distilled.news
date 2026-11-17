CREATE TABLE IF NOT EXISTS browser_use_discovery_runs (
  run_id TEXT PRIMARY KEY,
  acquisition_run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('RUNNING','PROPOSAL_ACCEPTED','VERIFIED','CANDIDATE','VALIDATED','ACTIVE','FAILED')),
  outcome TEXT,
  browser_use_discovery_runs INTEGER NOT NULL DEFAULT 1 CHECK (browser_use_discovery_runs BETWEEN 0 AND 1),
  discovery_model_calls INTEGER CHECK (discovery_model_calls BETWEEN 0 AND 32),
  browser_operations INTEGER CHECK (browser_operations BETWEEN 0 AND 128),
  agent_browser_actions INTEGER CHECK (agent_browser_actions BETWEEN 0 AND 64),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  total_duration_ms INTEGER CHECK (total_duration_ms BETWEEN 0 AND 600000),
  agent_duration_ms INTEGER CHECK (agent_duration_ms BETWEEN 0 AND 600000),
  verification_duration_ms INTEGER CHECK (verification_duration_ms BETWEEN 0 AND 600000)
);
CREATE INDEX IF NOT EXISTS browser_use_discovery_acquisition_idx ON browser_use_discovery_runs(acquisition_run_id);
