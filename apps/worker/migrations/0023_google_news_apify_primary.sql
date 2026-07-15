-- Google News is collected through one bounded Apify actor. The public RSS
-- URL remains on the source record as a human-readable link and query carrier.
UPDATE sources
SET provider = 'apify',
    actor_id = 'groupoject/google-news-scraper',
    actor_input_json = NULL,
    canonical_key = lower(
      'apify|google_news|' ||
      COALESCE((SELECT language FROM briefings WHERE briefings.id = sources.briefing_id), 'en') ||
      '|' ||
      CASE
        WHEN source_url LIKE '%?q=%' OR source_url LIKE '%&q=%' THEN
          substr(
            source_url,
            instr(source_url, 'q=') + 2,
            CASE
              WHEN instr(substr(source_url, instr(source_url, 'q=') + 2), '&') > 0
                THEN instr(substr(source_url, instr(source_url, 'q=') + 2), '&') - 1
              ELSE length(source_url)
            END
          )
        ELSE trim(replace(COALESCE(input, title), 'news:', ''))
      END
    ),
    last_error = NULL,
    failure_class = NULL,
    consecutive_failures = 0,
    health_state = CASE WHEN enabled = 1 THEN 'healthy' ELSE health_state END,
    next_retry_at = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = 'google_news';

DELETE FROM canonical_source_refreshes
WHERE canonical_key NOT IN (
  SELECT canonical_key
  FROM sources
  WHERE canonical_key IS NOT NULL
);
