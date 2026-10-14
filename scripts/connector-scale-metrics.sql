-- Read-only snapshot; compare successive samples during the multi-feed soak.
SELECT 'due_feeds' AS metric,COUNT(*) AS value FROM connector_feed_schedule WHERE due_ms<=unixepoch('now')*1000;
SELECT 'feed_lag_ms' AS metric,MAX(0,unixepoch('now')*1000-MIN(due_ms)) AS value FROM connector_feed_schedule WHERE due_ms>0;
SELECT 'rss' AS family,state,COUNT(*) AS jobs,MIN(due_at) AS oldest_due FROM connector_rss_poll_jobs GROUP BY state;
SELECT 'provider' AS family,state,COUNT(*) AS jobs,MIN(due_at) AS oldest_due FROM connector_provider_poll_jobs GROUP BY state;
SELECT last_error,COUNT(*) AS jobs FROM connector_provider_poll_jobs WHERE state='BLOCKED' GROUP BY last_error;
SELECT kind,COUNT(*) AS failures,MAX(observed_at) AS latest FROM connector_queue_recovery GROUP BY kind;
SELECT COUNT(*) AS held_windows,MAX(pending_collections) AS largest_wait FROM connector_publication_waits;
SELECT provider_id,limit_usd,reserved_usd FROM connector_provider_budgets WHERE provider_id NOT LIKE 'source:%';
SELECT provider_id,COUNT(*) AS funded_sources,SUM(reserved_usd) AS reserved_usd,MAX(reserved_usd) AS largest_source_reservation FROM connector_source_provider_budgets GROUP BY provider_id;
SELECT COUNT(*) AS uncertain_paid FROM connector_provider_operations WHERE payload_ref IS NULL;
SELECT COUNT(*) AS cached_resources FROM connector_public_fetch_cache WHERE expires_at>unixepoch('now')*1000;
-- Manual capacity snapshots, not queries for the Cron hot path. Compare growth
-- alongside bytes and published support; counts do not authorize deleting history.
SELECT 'fetch_runs' AS history,COUNT(*) AS rows FROM connector_fetch_runs
UNION ALL SELECT 'batches',COUNT(*) FROM connector_batches
UNION ALL SELECT 'intake_receipts',COUNT(*) FROM v1_intake_receipts
UNION ALL SELECT 'rss_poll_jobs',COUNT(*) FROM connector_rss_poll_jobs
UNION ALL SELECT 'provider_poll_jobs',COUNT(*) FROM connector_provider_poll_jobs;
-- D1 query metadata (meta.size_after) supplies physical database bytes; obtain
-- deployed capacity independently with `wrangler d1 info` after this snapshot.
SELECT 1 AS storage_probe;
