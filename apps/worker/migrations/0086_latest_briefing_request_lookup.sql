-- The feed reader needs only the newest request. Match its existing order,
-- including the ID tie-breaker, so retained windows do not require a sort.
CREATE INDEX IF NOT EXISTS v1_briefing_requests_latest_created
ON v1_feed_documents(feed_id,json_extract(json,'$.createdAt') DESC,id DESC)
WHERE kind='briefing_requests';

-- Page status checks must not scan all historical requests for a setup block.
CREATE INDEX IF NOT EXISTS v1_briefing_requests_setup_required ON v1_feed_documents(
  feed_id,json_extract(json,'$.state'),json_extract(json,'$.reason')
)
WHERE kind='briefing_requests' AND json_extract(json,'$.state')='PENDING'
  AND json_extract(json,'$.reason')='MODEL_SETUP_REQUIRED';

-- Keep the reader's latest-100 edition query bounded as retained history grows.
CREATE INDEX IF NOT EXISTS v1_editions_latest_created
ON v1_feed_documents(feed_id,json_extract(json,'$.createdAt') DESC,id DESC)
WHERE kind='editions';
