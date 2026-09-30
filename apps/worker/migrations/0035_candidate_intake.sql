CREATE TABLE candidate_items (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, resource_id TEXT NOT NULL REFERENCES upstream_resources(id),
  access_scope TEXT NOT NULL, connector_type TEXT NOT NULL, source_id TEXT NOT NULL,
  upstream_id TEXT, original_url TEXT, canonical_url TEXT, title_hint TEXT, published_at_hint TEXT, language_hint TEXT,
  payload_hash TEXT, supplied_payload_ref TEXT, discovered_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX candidate_url_identity ON candidate_items(tenant_id,access_scope,canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX candidate_upstream_identity ON candidate_items(tenant_id,access_scope,resource_id,upstream_id) WHERE upstream_id IS NOT NULL;
CREATE UNIQUE INDEX candidate_payload_identity ON candidate_items(tenant_id,access_scope,resource_id,payload_hash) WHERE payload_hash IS NOT NULL;
CREATE TABLE candidate_discoveries (
  id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidate_items(id), provider TEXT NOT NULL,
  run_id TEXT NOT NULL, query_id TEXT, discovered_at TEXT NOT NULL
);
CREATE TABLE candidate_eligibility_decisions (
  id TEXT PRIMARY KEY, candidate_id TEXT REFERENCES candidate_items(id), proposal_hash TEXT NOT NULL, eligible INTEGER NOT NULL,
  reason TEXT NOT NULL, method TEXT NOT NULL, decided_at TEXT NOT NULL
);
CREATE TABLE canonical_acquired_content (
  id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL UNIQUE REFERENCES candidate_items(id), source_id TEXT NOT NULL,
  access_scope TEXT NOT NULL, resolved_url TEXT, title TEXT, body TEXT NOT NULL, published_at TEXT, author TEXT,
  acquisition_method TEXT NOT NULL, acquisition_provider TEXT, raw_payload_ref TEXT, acquired_at TEXT NOT NULL,
  quality_json TEXT NOT NULL
);
CREATE TABLE normalized_evidence_items (
  id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL UNIQUE REFERENCES candidate_items(id),
  acquired_content_id TEXT NOT NULL UNIQUE REFERENCES canonical_acquired_content(id), source_id TEXT NOT NULL,
  access_scope TEXT NOT NULL, canonical_url TEXT, title TEXT NOT NULL, body TEXT NOT NULL, language TEXT NOT NULL,
  published_at TEXT, first_seen_at TEXT NOT NULL, content_hash TEXT NOT NULL, provenance_json TEXT NOT NULL
);
