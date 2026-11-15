-- An unresolved article belongs to the evidence window in which it was first
-- observed. Retain the job and its recovery path, but do not project the same
-- old failure into every later empty briefing window.
DROP VIEW v1_window_job_matches;
CREATE VIEW v1_window_job_matches AS
WITH facts AS (
  SELECT w.window_id,j.id AS job_id,
    COALESCE(json_extract(s.json,'$.feedRevision'),0) AS job_revision,
    json_extract(j.json,'$.kind') AS kind,
    json_extract(j.json,'$.state') AS state,
    COALESCE(json_extract(j.json,'$.exhausted'),0) AS exhausted,
    json_extract(j.json,'$.failureCode') AS failure_code,
    json_extract(j.json,'$.failureDetail') AS failure_detail,
    json_extract(j.json,'$.leaseUntil') AS lease_until,
    julianday(json_extract(i.json,'$.observation.observedAt')) AS observed,
    w.cutoff_ms,w.delivery_ms
  FROM v1_window_readiness w
  JOIN v1_feed_documents r ON r.kind='briefing_requests' AND r.id=w.window_id AND r.feed_id=w.feed_id
  JOIN v1_intake_scopes s ON s.feed_id=w.feed_id
  JOIN v1_jobs j ON j.feed_source_id=s.id
  LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id
  WHERE json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL
    AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS')
    AND json_extract(j.json,'$.state') IN ('PENDING','RUNNING','FAILED')
    AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR
      julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(w.cutoff))
    AND (json_extract(j.json,'$.state') IN ('PENDING','RUNNING') OR
      json_extract(i.json,'$.observation.observedAt') IS NULL OR
      julianday(json_extract(i.json,'$.observation.observedAt'))>=julianday(json_extract(r.json,'$.window.start')))
), classified AS (
  SELECT *, CASE
    WHEN state='PENDING' AND failure_detail='ARTICLE_PROVIDER_RECONCILIATION_WAIT' THEN 'BLOCKED'
    WHEN state='FAILED' OR exhausted<>0 OR (kind='ACQUIRE' AND state='PENDING' AND failure_code='BUDGET_EXHAUSTED') THEN 'FAILED'
    WHEN kind='ACQUIRE' THEN 'ACQUISITION'
    ELSE 'REVIEW' END AS bucket
  FROM facts
)
SELECT window_id,job_id,job_revision,bucket,
  CASE WHEN bucket='ACQUISITION' AND state='PENDING' AND failure_code='BACKPRESSURE'
    AND failure_detail IN ('HELPER_LOCAL_CAPACITY_BUSY','HELPER_GLOBAL_CAPACITY_BUSY','HELPER_HTTP_RATE_LIMIT') AND observed IS NOT NULL
  THEN MAX(delivery_ms, CASE WHEN lease_until IS NULL THEN cutoff_ms ELSE CAST(ROUND(unixepoch(lease_until,'subsec')*1000) AS INTEGER) END)
  END AS capacity_at_ms
FROM classified;

-- Memberships are derived. Stale active projections are re-enrolled by the
-- regular bounded sweep, which also invalidates their old wake-up records.
UPDATE v1_window_readiness SET enrollment_state='STALE',
  repair_after_ms=CAST(ROUND(unixepoch('now','subsec')*1000) AS INTEGER)
WHERE enrollment_state='ACTIVE';

