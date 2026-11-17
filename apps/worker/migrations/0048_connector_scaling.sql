-- Connector-owned additive scheduling/cache/accounting. No shared handoff changes.
CREATE TABLE connector_feed_schedule (
 feed_id TEXT PRIMARY KEY REFERENCES briefings(id) ON DELETE CASCADE,
 due_ms INTEGER NOT NULL DEFAULT 0, token TEXT, processing_token TEXT, processing_until INTEGER NOT NULL DEFAULT 0, last_error TEXT,
 attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX connector_feed_due ON connector_feed_schedule(due_ms,feed_id);
INSERT INTO connector_feed_schedule(feed_id) SELECT DISTINCT briefing_id FROM sources WHERE collection_owner='connector';
CREATE TRIGGER connector_schedule_insert AFTER INSERT ON sources WHEN NEW.collection_owner='connector'
BEGIN INSERT INTO connector_feed_schedule(feed_id) VALUES(NEW.briefing_id) ON CONFLICT(feed_id) DO UPDATE SET due_ms=0; END;
CREATE TRIGGER connector_schedule_change AFTER UPDATE OF enabled,input,source_url,kind,provider,actor_id,collection_owner ON sources
WHEN NEW.collection_owner='connector'
BEGIN INSERT INTO connector_feed_schedule(feed_id) VALUES(NEW.briefing_id) ON CONFLICT(feed_id) DO UPDATE SET due_ms=0; END;
CREATE TRIGGER connector_schedule_feed_change AFTER UPDATE OF paused,interest_profile,language,v1_briefing_interval_minutes,briefing_timezone,briefing_time_of_day ON briefings
BEGIN UPDATE connector_feed_schedule SET due_ms=0 WHERE feed_id=NEW.id; END;
ALTER TABLE connector_rss_poll_jobs ADD COLUMN dispatch_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connector_rss_poll_jobs ADD COLUMN dispatch_token TEXT;
ALTER TABLE connector_provider_poll_jobs ADD COLUMN dispatch_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connector_provider_poll_jobs ADD COLUMN dispatch_token TEXT;
ALTER TABLE connector_rss_poll_jobs ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT '';
ALTER TABLE connector_provider_poll_jobs ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT '';
UPDATE connector_rss_poll_jobs SET scheduled_at=due_at;
UPDATE connector_provider_poll_jobs SET scheduled_at=due_at;
CREATE INDEX connector_rss_due ON connector_rss_poll_jobs(state,due_at,job_id);
CREATE INDEX connector_provider_due ON connector_provider_poll_jobs(state,due_at,job_id);
CREATE INDEX connector_rss_feed_due ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedId'),state,due_at,job_id);
CREATE INDEX connector_provider_feed_due ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedId'),state,due_at,job_id);
CREATE INDEX connector_rss_source_due ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedSourceId'),due_at DESC);
CREATE INDEX connector_provider_source_due ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedSourceId'),due_at DESC);
CREATE INDEX connector_sources_feed ON sources(briefing_id,collection_owner,enabled,id);
CREATE INDEX connector_intake_pending ON v1_jobs(feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'),id);
CREATE TABLE connector_queue_dispatch (
 kind TEXT NOT NULL, id TEXT NOT NULL, available_ms INTEGER NOT NULL,
 token TEXT NOT NULL, sends INTEGER NOT NULL DEFAULT 1, last_error TEXT,
 PRIMARY KEY(kind,id)
);
CREATE TABLE connector_queue_recovery (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, feed_id TEXT, job_id TEXT,
 attempts INTEGER NOT NULL, reason TEXT NOT NULL, observed_at TEXT NOT NULL
);
CREATE TABLE connector_publication_waits (
 request_id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, window_end TEXT NOT NULL,
 pending_collections INTEGER NOT NULL, checked_at TEXT NOT NULL
);
CREATE TABLE connector_public_fetch_cache (
 cache_key TEXT PRIMARY KEY, lease_until INTEGER NOT NULL DEFAULT 0, token TEXT,
 expires_at INTEGER NOT NULL DEFAULT 0, payload_key TEXT, status INTEGER, headers TEXT
);
CREATE INDEX connector_public_cache_expiry ON connector_public_fetch_cache(expires_at);
CREATE TABLE connector_source_provider_budgets (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, provider_id TEXT NOT NULL,
 reserved_usd REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id,feed_source_id,provider_id)
);
