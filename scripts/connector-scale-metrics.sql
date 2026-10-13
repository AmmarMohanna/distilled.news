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
PRAGMA page_count;
PRAGMA page_size;
