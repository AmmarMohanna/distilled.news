ALTER TABLE agent_model_call_attempts ADD COLUMN started_at TEXT;
ALTER TABLE agent_model_call_attempts ADD COLUMN completed_at TEXT;
ALTER TABLE agent_model_call_attempts ADD COLUMN usage_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (usage_confirmed IN (0,1));
ALTER TABLE agent_model_call_attempts ADD COLUMN failure_class TEXT CHECK (
  failure_class IS NULL OR failure_class IN (
    'deadline_exceeded',
    'provider_http_failure',
    'malformed_response',
    'provider_identity_mismatch',
    'transport_failure',
    'cancelled',
    'lease_lost',
    'run_deadline_exhausted'
  )
);
ALTER TABLE agent_model_call_attempts ADD COLUMN reserved_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reserved_input_tokens >= 0);
ALTER TABLE agent_model_call_attempts ADD COLUMN reserved_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reserved_output_tokens >= 0);
ALTER TABLE agent_model_call_attempts ADD COLUMN reserved_cost_usd REAL NOT NULL DEFAULT 0 CHECK (reserved_cost_usd >= 0);

UPDATE agent_model_call_attempts
SET started_at = COALESCE(
  started_at,
  (SELECT created_at FROM agent_model_calls WHERE agent_model_calls.id = agent_model_call_attempts.model_call_id)
),
usage_confirmed = CASE WHEN state = 'completed' THEN 1 ELSE 0 END;
