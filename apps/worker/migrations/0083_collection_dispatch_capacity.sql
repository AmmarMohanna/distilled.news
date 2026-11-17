-- Bound dispatch occupancy reads to live pending work, not retained poll history.
CREATE INDEX IF NOT EXISTS connector_rss_dispatch_capacity
ON connector_rss_poll_jobs(json_extract(request,'$.scope.feedId'),dispatch_until)
WHERE state='PENDING';
-- The priority predicate must not scan completed reporting-window history.
CREATE INDEX IF NOT EXISTS v1_collection_pending_deadlines
ON v1_feed_documents(feed_id,json_extract(json,'$.window.end'))
WHERE kind='briefing_requests' AND json_extract(json,'$.state')='PENDING';
CREATE INDEX IF NOT EXISTS connector_provider_dispatch_capacity
ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedId'),dispatch_until)
WHERE state='PENDING';
