PRAGMA foreign_keys = ON;

CREATE TABLE agent_runs (
  run_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  objective TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('known_candidate', 'discovery')),
  state TEXT NOT NULL CHECK (state IN ('admitted','queued','running','waiting_human','suspended','completed','failed','cancelled')),
  generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
  policy_snapshot_id TEXT NOT NULL,
  completion_contract_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX agent_runs_tenant_state_idx ON agent_runs (tenant_id, state, updated_at);

CREATE TABLE agent_run_configurations (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  configuration_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_run_leases (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE agent_run_attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('completed','failed','superseded','suspended')),
  UNIQUE (run_id, generation)
);

CREATE TABLE agent_turns (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  state TEXT NOT NULL,
  page_state_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, sequence)
);

CREATE TABLE agent_model_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  role TEXT NOT NULL,
  route_json TEXT NOT NULL,
  context_manifest_hash TEXT NOT NULL,
  stable_instructions_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('created','streaming','completed','failed')),
  created_at TEXT NOT NULL
);

CREATE TABLE agent_model_call_attempts (
  id TEXT PRIMARY KEY,
  model_call_id TEXT NOT NULL REFERENCES agent_model_calls(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  gateway TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('started','completed','failed')),
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  fallback_reason TEXT,
  UNIQUE (model_call_id, attempt)
);

CREATE TABLE agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  model_call_id TEXT NOT NULL REFERENCES agent_model_calls(id) ON DELETE CASCADE,
  plan_index INTEGER NOT NULL CHECK (plan_index >= 0 AND plan_index < 5),
  tool TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (model_call_id, plan_index)
);

CREATE INDEX agent_tool_calls_run_state_idx ON agent_tool_calls (run_id, state, created_at);

CREATE TABLE agent_policy_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
  allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
  reason_code TEXT NOT NULL,
  policy_snapshot_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL
);

CREATE TABLE agent_tool_intents (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  tool TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  persisted_at TEXT NOT NULL
);

CREATE TABLE agent_tool_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL UNIQUE REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('succeeded','failed','cancelled','effect_unknown')),
  effect_certainty TEXT NOT NULL CHECK (effect_certainty IN ('not_dispatched','known_applied','known_not_applied','unknown')),
  output_json TEXT,
  error_code TEXT,
  error_message TEXT,
  completed_at TEXT NOT NULL
);

CREATE TABLE agent_observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  turn_id TEXT NOT NULL REFERENCES agent_turns(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
  envelope_json TEXT NOT NULL,
  retrieved_at TEXT NOT NULL
);

CREATE INDEX agent_observations_run_time_idx ON agent_observations (run_id, retrieved_at);

CREATE TABLE agent_checkpoints (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  checkpoint_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_challenges (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  challenge_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_completion_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  proposal_json TEXT NOT NULL,
  proposed_at TEXT NOT NULL
);

CREATE TABLE agent_completion_acceptances (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES agent_completion_proposals(id) ON DELETE CASCADE,
  acceptance_json TEXT NOT NULL,
  decided_at TEXT NOT NULL
);

CREATE TABLE acquired_content (
  acceptance_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  generation INTEGER NOT NULL,
  canonical_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  UNIQUE (run_id, canonical_url, content_hash)
);

CREATE TABLE agent_browser_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('provisioning','ready','active','closed','crashed')),
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_browser_contexts (
  id TEXT PRIMARY KEY,
  browser_session_id TEXT NOT NULL REFERENCES agent_browser_sessions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE agent_run_budgets (
  run_id TEXT PRIMARY KEY REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  budget_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, sequence)
);

CREATE INDEX agent_run_events_run_sequence_idx ON agent_run_events (run_id, sequence);

CREATE TABLE agent_outbox (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind = 'agent_run_wake'),
  state TEXT NOT NULL CHECK (state IN ('pending','delivered','acknowledged')),
  created_at TEXT NOT NULL,
  acknowledged_at TEXT
);

CREATE INDEX agent_outbox_state_idx ON agent_outbox (state, created_at);
