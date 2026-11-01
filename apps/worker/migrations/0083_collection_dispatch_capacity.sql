-- Bound dispatch occupancy reads to live pending work, not retained poll history.
CREATE INDEX IF NOT EXISTS connector_rss_dispatch_capacity
ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedId'),dispatch_until)
WHERE state='PENDING';
CREATE INDEX IF NOT EXISTS connector_provider_dispatch_capacity
ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedId'),dispatch_until)
WHERE state='PENDING';
