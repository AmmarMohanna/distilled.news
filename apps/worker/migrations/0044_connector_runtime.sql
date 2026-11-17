-- Install connector-owned schemas without changing frozen downstream migrations.

CREATE TABLE IF NOT EXISTS connector_source_sequences (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id, feed_source_id));
CREATE TABLE IF NOT EXISTS connector_fetch_runs (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, run_id TEXT NOT NULL,
 source_id TEXT NOT NULL, sequence INTEGER NOT NULL, started_at TEXT NOT NULL, configuration_key TEXT NOT NULL, fetch_claimed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(feed_id, feed_source_id, run_id), UNIQUE(feed_id, feed_source_id, sequence));
CREATE TABLE IF NOT EXISTS connector_batches (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, handoff_id TEXT NOT NULL,
 data TEXT NOT NULL, receipts TEXT, PRIMARY KEY(feed_id, feed_source_id, handoff_id));
CREATE TABLE IF NOT EXISTS connector_checkpoints (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, version INTEGER NOT NULL,
 sequence INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(feed_id, feed_source_id));

CREATE TABLE IF NOT EXISTS connector_rss_poll_jobs (
 job_id TEXT PRIMARY KEY, request TEXT NOT NULL, request_hash TEXT NOT NULL,
 due_at TEXT NOT NULL, lease_until TEXT, lease_version INTEGER NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'PENDING', result TEXT, last_error TEXT);

CREATE TABLE IF NOT EXISTS connector_provider_batches (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, batch_key TEXT NOT NULL, data TEXT NOT NULL, receipts TEXT,
 PRIMARY KEY(feed_id,feed_source_id,batch_key));
CREATE TABLE IF NOT EXISTS connector_provider_cursors (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, provider_id TEXT NOT NULL, configuration_key TEXT NOT NULL,
 version INTEGER NOT NULL, sequence INTEGER NOT NULL, cursor TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,provider_id,configuration_key));
CREATE TABLE IF NOT EXISTS connector_provider_attempts (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, run_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,run_id));
CREATE TABLE IF NOT EXISTS connector_provider_snapshots (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,snapshot_id));
CREATE TABLE IF NOT EXISTS connector_provider_failure_coverage (
 feed_id TEXT NOT NULL, feed_source_id TEXT NOT NULL, coverage_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(feed_id,feed_source_id,coverage_id));


CREATE TABLE IF NOT EXISTS connector_provider_budgets(provider_id TEXT PRIMARY KEY, limit_usd REAL NOT NULL, reserved_usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS connector_provider_operations(
 provider_id TEXT NOT NULL, operation_id TEXT NOT NULL, request_hash TEXT NOT NULL, ceiling_usd REAL NOT NULL,
 payload_ref TEXT, status INTEGER, headers TEXT, PRIMARY KEY(provider_id,operation_id));
CREATE TABLE IF NOT EXISTS connector_provider_poll_jobs(
 job_id TEXT PRIMARY KEY, request TEXT NOT NULL, initial_hash TEXT NOT NULL, provider_order TEXT NOT NULL,
 due_at TEXT NOT NULL, lease_until TEXT, lease_version INTEGER NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, pages INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'PENDING', result TEXT, last_error TEXT);

