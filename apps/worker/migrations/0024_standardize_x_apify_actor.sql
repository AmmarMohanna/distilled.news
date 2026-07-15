-- Keep every X source on the same bounded Apify actor. Existing actor inputs
-- already use the xquik-compatible searchTerms/queryType/maxItems schema.
UPDATE sources
SET actor_id = 'xquik/x-tweet-scraper',
    last_error = NULL,
    failure_class = NULL,
    consecutive_failures = 0,
    health_state = CASE WHEN enabled = 1 THEN 'healthy' ELSE health_state END,
    next_retry_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE provider = 'apify'
  AND kind IN ('x_profile', 'x_search')
  AND COALESCE(actor_id, '') <> 'xquik/x-tweet-scraper';

DELETE FROM canonical_source_refreshes
WHERE canonical_key NOT IN (
  SELECT canonical_key
  FROM sources
  WHERE canonical_key IS NOT NULL
);
