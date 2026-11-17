-- Keep carry-forward lookup proportional to unresolved requests, including legacy missing states.
CREATE INDEX IF NOT EXISTS v1_unresolved_publication_windows
ON v1_feed_documents(feed_id,id)
WHERE kind='briefing_requests' AND (json_extract(json,'$.state') IS NOT 'DONE' OR json_extract(json,'$.result')='DEFERRED');
