UPDATE sources
SET provider = 'rss',
    actor_id = NULL,
    actor_input_json = NULL,
    canonical_key = lower(
      'rss|google_news|' || rtrim(trim(COALESCE(source_url, input, title)), '/')
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = 'google_news'
  AND provider != 'rss';

DELETE FROM canonical_source_refreshes
WHERE canonical_key NOT IN (
  SELECT canonical_key
  FROM sources
  WHERE canonical_key IS NOT NULL
);
