-- Scheduler-approved frozen collection scopes; changing a page never changes its window.
CREATE TABLE connector_collection_windows (
 run_id TEXT PRIMARY KEY, feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
 feed_source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
 configuration_revision INTEGER NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL
);
CREATE INDEX connector_collection_window_authority ON connector_collection_windows(feed_source_id,configuration_revision,start_time,end_time);
CREATE INDEX connector_collection_window_history ON connector_collection_windows(feed_source_id,configuration_revision,end_time);
-- Anonymous upstream cooldowns are shared across Feeds, never source evidence.
CREATE TABLE connector_http_cooldowns (
 origin TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
 retry_at INTEGER NOT NULL, observed_at INTEGER NOT NULL
);
