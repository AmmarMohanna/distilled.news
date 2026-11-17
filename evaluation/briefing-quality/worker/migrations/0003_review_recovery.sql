-- Financial history is retained; isolation only releases the execution fence.
CREATE TABLE eval_call_isolations (call_id TEXT PRIMARY KEY REFERENCES eval_calls(id),policy TEXT NOT NULL,created_at TEXT NOT NULL,reason TEXT NOT NULL);
CREATE TABLE eval_provider_receipts (call_id TEXT PRIMARY KEY REFERENCES eval_calls(id),generation_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE eval_accounting_recoveries (call_id TEXT PRIMARY KEY REFERENCES eval_calls(id),evidence_key TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE eval_recovery_events (job_id TEXT PRIMARY KEY,previous_status TEXT NOT NULL,previous_error TEXT,created_at TEXT NOT NULL,review_version TEXT NOT NULL);
ALTER TABLE eval_jobs ADD COLUMN review_version TEXT NOT NULL DEFAULT 'atomic-development-review-v1';
ALTER TABLE eval_jobs ADD COLUMN outcome TEXT NOT NULL DEFAULT 'published';
