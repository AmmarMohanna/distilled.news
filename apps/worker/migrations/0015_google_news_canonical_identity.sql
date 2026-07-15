UPDATE sources
SET canonical_key = lower(
  provider || '|' || kind || '|' || rtrim(trim(COALESCE(source_url, input, title)), '/')
)
WHERE kind = 'google_news';

DELETE FROM canonical_source_refreshes
WHERE canonical_key NOT IN (
  SELECT canonical_key
  FROM sources
  WHERE canonical_key IS NOT NULL
);
