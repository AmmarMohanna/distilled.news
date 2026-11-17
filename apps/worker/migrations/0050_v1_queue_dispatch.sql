-- Transport reservations are independent of canonical Feed/source epochs.
CREATE TABLE IF NOT EXISTS v1_queue_dispatches (
 kind TEXT NOT NULL, id TEXT NOT NULL, token TEXT NOT NULL,
 lease_until INTEGER NOT NULL, not_before INTEGER NOT NULL DEFAULT 0,
 send_count INTEGER NOT NULL DEFAULT 0, last_failure TEXT,
 PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS v1_queue_outcomes (
 message_id TEXT NOT NULL, kind TEXT NOT NULL, job_id TEXT NOT NULL, feed_id TEXT,
 attempts INTEGER NOT NULL, outcome TEXT NOT NULL, reason TEXT NOT NULL,
 observed_at TEXT NOT NULL, PRIMARY KEY(message_id,attempts)
);
CREATE INDEX IF NOT EXISTS v1_jobs_due ON v1_jobs(
 feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt')
);

CREATE INDEX IF NOT EXISTS v1_queue_outcomes_feed ON v1_queue_outcomes(feed_id,observed_at);
