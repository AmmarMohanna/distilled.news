-- Cohort inventory and high-signal production health report.
SELECT
  'inventory' AS report,
  (SELECT COUNT(*) FROM accounts WHERE id LIKE 'account_canary_%') AS accounts,
  (SELECT COUNT(*) FROM briefings WHERE id LIKE 'briefing_canary_%') AS feeds,
  (SELECT COUNT(*) FROM sources WHERE id LIKE 'source_canary_%') AS sources,
  (SELECT COUNT(*) FROM raw_messages WHERE briefing_id LIKE 'briefing_canary_%') AS raw_messages,
  (SELECT COUNT(*) FROM briefing_editions WHERE briefing_id LIKE 'briefing_canary_%') AS editions;

SELECT
  'language_coverage' AS report,
  b.language,
  COUNT(*) AS feeds,
  SUM(CASE WHEN EXISTS (SELECT 1 FROM briefing_editions e WHERE e.briefing_id = b.id AND e.status = 'published') THEN 1 ELSE 0 END) AS feeds_with_published_editions,
  SUM(CASE WHEN EXISTS (SELECT 1 FROM raw_messages r WHERE r.briefing_id = b.id) THEN 1 ELSE 0 END) AS feeds_with_imports,
  ROUND(COALESCE(SUM((SELECT SUM(u.estimated_cost_usd) FROM llm_usage_events u WHERE u.briefing_id = b.id)), 0), 6) AS estimated_llm_cost_usd
FROM briefings b
WHERE b.id LIKE 'briefing_canary_%'
GROUP BY b.language
ORDER BY b.language;

SELECT
  'source_provider_health' AS report,
  s.provider,
  s.kind,
  COUNT(*) AS sources,
  SUM(CASE WHEN s.enabled = 1 THEN 1 ELSE 0 END) AS enabled,
  SUM(CASE WHEN s.last_error IS NOT NULL THEN 1 ELSE 0 END) AS with_errors,
  MAX(s.last_checked_at) AS latest_check
FROM sources s
WHERE s.id LIKE 'source_canary_%'
GROUP BY s.provider, s.kind
ORDER BY s.provider, s.kind;

SELECT
  'feed_health' AS report,
  a.username,
  b.slug,
  b.language,
  b.title,
  COUNT(DISTINCT s.id) AS sources,
  SUM(CASE WHEN s.last_error IS NOT NULL THEN 1 ELSE 0 END) AS sources_with_errors,
  MAX(s.last_checked_at) AS latest_source_check,
  (SELECT COUNT(*) FROM raw_messages r WHERE r.briefing_id = b.id) AS raw_messages,
  (SELECT COUNT(*) FROM processing_jobs j WHERE j.briefing_id = b.id AND j.state = 'queued') AS queued_jobs,
  (SELECT COUNT(*) FROM processing_jobs j WHERE j.briefing_id = b.id AND j.state = 'failed') AS failed_jobs,
  (SELECT COUNT(*) FROM briefing_editions e WHERE e.briefing_id = b.id AND e.status = 'published') AS published_editions,
  (SELECT MAX(e.published_at) FROM briefing_editions e WHERE e.briefing_id = b.id AND e.status = 'published') AS latest_published_at,
  ROUND(COALESCE((SELECT SUM(u.estimated_cost_usd) FROM llm_usage_events u WHERE u.briefing_id = b.id), 0), 6) AS estimated_llm_cost_usd
FROM briefings b
JOIN accounts a ON a.id = b.owner_account_id
LEFT JOIN sources s ON s.briefing_id = b.id
WHERE b.id LIKE 'briefing_canary_%'
GROUP BY b.id
ORDER BY b.language, a.username, b.slug;

-- Hourly publication ledger. A completed window may be published or legitimately empty,
-- but it must have an immutable cutoff and must not remain running or failed.
SELECT
  'hourly_window_health' AS report,
  b.language,
  a.username,
  b.slug,
  b.next_briefing_at,
  COUNT(w.id) AS windows_last_24h,
  SUM(CASE WHEN w.state = 'published' THEN 1 ELSE 0 END) AS published_windows,
  SUM(CASE WHEN w.state = 'empty' THEN 1 ELSE 0 END) AS empty_windows,
  SUM(CASE WHEN w.state = 'running' THEN 1 ELSE 0 END) AS running_windows,
  SUM(CASE WHEN w.state = 'failed' THEN 1 ELSE 0 END) AS failed_windows,
  SUM(CASE WHEN w.id IS NOT NULL AND w.content_cutoff_at IS NULL THEN 1 ELSE 0 END) AS legacy_windows_without_cutoff,
  SUM(CASE WHEN w.id IS NOT NULL AND w.content_cutoff_at IS NULL AND w.window_end >= (
    SELECT MIN(w2.window_end)
    FROM briefing_windows w2
    WHERE w2.briefing_id = b.id
      AND w2.cadence = 'hourly'
      AND w2.content_cutoff_at IS NOT NULL
  ) THEN 1 ELSE 0 END) AS missing_cutoffs_since_cutover,
  SUM(CASE WHEN w.state = 'published' AND w.edition_id IS NULL THEN 1 ELSE 0 END) AS missing_editions,
  MAX(w.window_end) AS latest_completed_window,
  MAX(w.prepared_at) AS latest_prepared_at
FROM briefings b
JOIN accounts a ON a.id = b.owner_account_id
LEFT JOIN briefing_windows w
  ON w.briefing_id = b.id
  AND w.cadence = 'hourly'
  AND w.window_end >= strftime('%Y-%m-%dT%H:00:00.000Z', 'now', '-24 hours')
WHERE b.id LIKE 'briefing_canary_%'
GROUP BY b.id
ORDER BY b.language, a.username, b.slug;

SELECT
  'source_errors' AS report,
  b.language,
  b.title AS feed_title,
  s.title AS source_title,
  s.provider,
  s.kind,
  s.enabled,
  s.last_checked_at,
  s.last_error
FROM sources s
JOIN briefings b ON b.id = s.briefing_id
WHERE s.id LIKE 'source_canary_%' AND s.last_error IS NOT NULL
ORDER BY s.last_checked_at ASC;

SELECT
  'job_errors' AS report,
  b.language,
  b.title AS feed_title,
  j.state,
  j.error,
  j.created_at,
  j.updated_at
FROM processing_jobs j
JOIN briefings b ON b.id = j.briefing_id
WHERE b.id LIKE 'briefing_canary_%' AND j.state IN ('queued', 'failed')
ORDER BY j.updated_at ASC
LIMIT 200;

-- Obvious rendering artifacts. Human review still checks meaning and grammar.
SELECT
  'summary_artifacts' AS report,
  b.language,
  b.title AS feed_title,
  e.id AS edition_id,
  e.published_at,
  e.summary
FROM briefing_editions e
JOIN briefings b ON b.id = e.briefing_id
WHERE b.id LIKE 'briefing_canary_%'
  AND (
    e.summary LIKE '%&#%'
    OR e.summary LIKE '%<script%'
    OR e.summary LIKE '%<style%'
    OR instr(e.summary, '____') > 0
    OR e.summary LIKE '%����%'
    OR length(trim(e.summary)) < 20
  )
ORDER BY e.published_at DESC;

-- Latest content sample for typo, language, evidence, and editorial review.
SELECT
  'latest_content_sample' AS report,
  b.language,
  a.username,
  b.slug,
  b.title AS feed_title,
  e.published_at,
  e.summary,
  e.sections_json
FROM briefing_editions e
JOIN briefings b ON b.id = e.briefing_id
JOIN accounts a ON a.id = b.owner_account_id
WHERE b.id LIKE 'briefing_canary_%'
  AND e.published_at = (SELECT MAX(e2.published_at) FROM briefing_editions e2 WHERE e2.briefing_id = b.id)
ORDER BY b.language, a.username, b.slug;
