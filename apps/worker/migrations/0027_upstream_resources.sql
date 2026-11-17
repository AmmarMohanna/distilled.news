CREATE TABLE upstream_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  canonical_source_url TEXT NOT NULL,
  resource_locator TEXT,
  source_family TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, canonical_source_url, resource_locator)
);
CREATE INDEX upstream_resources_tenant_idx ON upstream_resources(tenant_id, updated_at);