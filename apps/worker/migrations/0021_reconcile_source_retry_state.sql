UPDATE canonical_source_refreshes
SET next_refresh_at = (
  SELECT MIN(sources.next_retry_at)
  FROM sources
  WHERE sources.canonical_key = canonical_source_refreshes.canonical_key
    AND sources.enabled = 1
    AND sources.next_retry_at IS NOT NULL
),
updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM sources
  WHERE sources.canonical_key = canonical_source_refreshes.canonical_key
    AND sources.enabled = 1
    AND sources.health_state IN ('degraded', 'backoff')
    AND sources.next_retry_at IS NOT NULL
    AND sources.next_retry_at < canonical_source_refreshes.next_refresh_at
);
