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

SELECT
  'source_errors' AS report,
  b.language,
  b.title AS feed_title,
  s.title AS source_title,
  s.provider,
  s.kind,
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
    OR e.summary LIKE '%____%'
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

