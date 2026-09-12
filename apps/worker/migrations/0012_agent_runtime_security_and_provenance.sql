PRAGMA foreign_keys = OFF;

ALTER TABLE agent_model_call_attempts RENAME TO agent_model_call_attempts_legacy;

CREATE TABLE agent_model_call_attempts (
  id TEXT PRIMARY KEY,
  model_call_id TEXT NOT NULL REFERENCES agent_model_calls(id) ON DELETE CASCADE,
  requested_provider TEXT NOT NULL,
  actual_provider TEXT,
  requested_model TEXT NOT NULL,
  actual_model TEXT,
  requested_deployment TEXT NOT NULL CHECK (requested_deployment IN ('api','self_hosted')),
  actual_deployment TEXT CHECK (actual_deployment IS NULL OR actual_deployment IN ('api','self_hosted')),
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  requested_gateway TEXT NOT NULL,
  actual_gateway TEXT,
  state TEXT NOT NULL CHECK (state IN ('started','completed','failed')),
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  fallback_reason TEXT,
  UNIQUE (model_call_id, attempt)
);

INSERT INTO agent_model_call_attempts (
  id,model_call_id,requested_provider,requested_model,requested_deployment,attempt,requested_gateway,state,
  input_tokens,output_tokens,cost_usd,latency_ms,fallback_reason
)
SELECT a.id,a.model_call_id,a.provider,a.model,
  COALESCE(json_extract(c.route_json,'$.deployment'),'api'),a.attempt,a.gateway,a.state,
  a.input_tokens,a.output_tokens,a.cost_usd,a.latency_ms,a.fallback_reason
FROM agent_model_call_attempts_legacy a JOIN agent_model_calls c ON c.id=a.model_call_id;

DROP TABLE agent_model_call_attempts_legacy;

ALTER TABLE agent_run_acquired_content RENAME TO agent_run_acquired_content_legacy;
ALTER TABLE acquired_content RENAME TO acquired_content_legacy;

CREATE TABLE acquired_content (
  acceptance_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, resource_id, candidate_id, canonical_url, content_hash)
);

CREATE TABLE agent_run_acquired_content (
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  acceptance_id TEXT NOT NULL REFERENCES acquired_content(acceptance_id) ON DELETE RESTRICT,
  observation_id TEXT NOT NULL REFERENCES agent_observations(id) ON DELETE RESTRICT,
  generation INTEGER NOT NULL,
  provenance_json TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (run_id, acceptance_id)
);

INSERT INTO acquired_content (acceptance_id,tenant_id,resource_id,candidate_id,canonical_url,content_hash,content_json,created_at)
SELECT acceptance_id,tenant_id,resource_id,candidate_id,canonical_url,content_hash,
  json_object(
    'acceptanceId',acceptance_id,'tenantId',tenant_id,'resourceId',resource_id,'candidateId',candidate_id,
    'canonicalUrl',canonical_url,'publisherTimestamp',json_extract(content_json,'$.publisherTimestamp'),
    'title',json_extract(content_json,'$.title'),'excerpt',json_extract(content_json,'$.excerpt'),
    'body',json_extract(content_json,'$.body'),'contentHash',content_hash
  ),accepted_at
FROM acquired_content_legacy;

INSERT INTO agent_run_acquired_content (run_id,acceptance_id,observation_id,generation,provenance_json,linked_at)
SELECT l.run_id,l.acceptance_id,l.observation_id,t.generation,
  json_object(
    'runId',l.run_id,'acquisitionAttempt',r.acquisition_attempt,'generation',t.generation,
    'turnId',t.turn_id,'modelCallId',t.model_call_id,'toolCallId',t.id,'observationId',l.observation_id,
    'rawArtifactRef',json_extract(o.envelope_json,'$.raw.ref'),'finalUrl',json_extract(o.envelope_json,'$.finalUrl'),
    'acceptedAt',l.linked_at
  ),l.linked_at
FROM agent_run_acquired_content_legacy l
JOIN agent_observations o ON o.id=l.observation_id
JOIN agent_tool_calls t ON t.id=o.tool_call_id
JOIN agent_runs r ON r.run_id=l.run_id;

DROP TABLE agent_run_acquired_content_legacy;
DROP TABLE acquired_content_legacy;

ALTER TABLE agent_outbox RENAME TO agent_outbox_legacy;

CREATE TABLE agent_outbox (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'agent_run_wake'),
  state TEXT NOT NULL CHECK (state IN ('pending','delivered','acknowledged','failed')),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  acknowledged_at TEXT,
  failed_at TEXT,
  failure_reason TEXT
);

INSERT INTO agent_outbox (id,run_id,kind,state,created_at,delivered_at,attempts,next_attempt_at,acknowledged_at)
SELECT id,run_id,kind,state,created_at,delivered_at,attempts,next_attempt_at,acknowledged_at FROM agent_outbox_legacy;

DROP TABLE agent_outbox_legacy;
CREATE INDEX agent_outbox_state_idx ON agent_outbox (state, next_attempt_at, created_at);

PRAGMA foreign_keys = ON;
