-- Match the exact source-health predicate and ordering; do not sort retained result payloads.
CREATE INDEX IF NOT EXISTS connector_rss_health_lookup
ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedSourceId'),CASE WHEN state IN ('DONE','BLOCKED') OR last_error NOT IN ('INTAKE_BUSY','BACKPRESSURE') THEN 0 ELSE 1 END,scheduled_at DESC,job_id DESC)
WHERE state IN ('DONE','BLOCKED') OR last_error IS NOT NULL;
CREATE INDEX IF NOT EXISTS connector_provider_health_lookup
ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedSourceId'),CASE WHEN state IN ('DONE','BLOCKED') OR last_error NOT IN ('INTAKE_BUSY','BACKPRESSURE') THEN 0 ELSE 1 END,scheduled_at DESC,job_id DESC)
WHERE state IN ('DONE','BLOCKED') OR last_error IS NOT NULL;
CREATE INDEX IF NOT EXISTS connector_provider_dispatch_token_lookup
ON connector_provider_poll_jobs(dispatch_token);
