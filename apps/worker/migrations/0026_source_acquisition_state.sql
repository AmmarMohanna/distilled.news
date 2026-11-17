CREATE TABLE IF NOT EXISTS source_acquisition_state (
  scope_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  last_successful_boundary TEXT,
  unresolved_start TEXT,
  unresolved_end TEXT,
  state_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_source_acquisition_state_resource ON source_acquisition_state (tenant_id, resource_id);
