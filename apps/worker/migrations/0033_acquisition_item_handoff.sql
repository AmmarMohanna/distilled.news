-- Canonical acquired content is a product handoff, not an agent transcript.
CREATE TABLE acquired_source_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL REFERENCES upstream_resources(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,
  canonical_url TEXT,
  source_item_id TEXT,
  source_url TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  published_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  workflow_id TEXT,
  workflow_version INTEGER,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(tenant_id,resource_id,identity)
);
CREATE INDEX acquired_source_items_window ON acquired_source_items(tenant_id,resource_id,published_at);
CREATE INDEX acquired_source_items_expiry ON acquired_source_items(expires_at);
-- Lease fences concurrent public requests for the same tenant/source authority.
CREATE TABLE source_acquisition_leases (
  scope_key TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
