-- Applied ONLY to the dedicated evaluator database, never SOURCE_DB.
CREATE TABLE eval_jobs (
 id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, language TEXT NOT NULL,
 window_end TEXT NOT NULL, published_at TEXT NOT NULL, status TEXT NOT NULL,
 snapshot_key TEXT, snapshot_hash TEXT, report_key TEXT, error TEXT,
 updated_at TEXT NOT NULL, attempt_id TEXT, flagged INTEGER NOT NULL DEFAULT 0,
 metrics_json TEXT, expires_at TEXT, operational_json TEXT
);
CREATE INDEX eval_jobs_status ON eval_jobs(status,window_end);
CREATE INDEX eval_jobs_language_feed ON eval_jobs(language,feed_id,status);
CREATE TABLE eval_calls (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL, stage TEXT NOT NULL, day_utc TEXT NOT NULL,
 state TEXT NOT NULL, reservation_micro INTEGER NOT NULL, cost_micro INTEGER,
 request_hash TEXT NOT NULL, response_key TEXT, created_at TEXT NOT NULL,
 provider_id TEXT, input_tokens INTEGER, output_tokens INTEGER
);
CREATE INDEX eval_calls_day ON eval_calls(day_utc,state);
CREATE TABLE eval_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE eval_annotations (
 job_id TEXT PRIMARY KEY, disposition TEXT NOT NULL,
 note TEXT NOT NULL, reviewer TEXT NOT NULL, updated_at TEXT NOT NULL
);
