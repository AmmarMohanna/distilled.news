-- Indexed execution exclusion for a shared checkpoint and the single helper session.
CREATE INDEX IF NOT EXISTS connector_provider_source_active
ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedSourceId'),state,lease_until);
CREATE INDEX IF NOT EXISTS connector_provider_telegram_active
ON connector_provider_poll_jobs(lease_until)
WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram';
CREATE INDEX IF NOT EXISTS connector_rss_source_active
ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedSourceId'),state,lease_until);
