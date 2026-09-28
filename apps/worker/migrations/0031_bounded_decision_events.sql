CREATE TABLE bounded_decision_events (
  id TEXT PRIMARY KEY,run_id TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,
  outcome TEXT NOT NULL,choice TEXT,confidence REAL,duration_ms INTEGER NOT NULL,input_tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX bounded_decision_run_idx ON bounded_decision_events(run_id,created_at);
ALTER TABLE browser_use_discovery_runs ADD COLUMN decision_mode TEXT NOT NULL DEFAULT 'GENERATIVE_ONLY';
ALTER TABLE browser_use_discovery_runs ADD COLUMN jev_calls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE browser_use_discovery_runs ADD COLUMN decision_fallbacks INTEGER NOT NULL DEFAULT 0;
