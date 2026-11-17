-- Routine dispatch must examine unresolved work, rather than retained completed jobs.
-- Both legacy missing exhausted flags and explicit zero remain runnable.
CREATE INDEX IF NOT EXISTS v1_jobs_runnable_scope ON v1_jobs(
  feed_source_id,json_extract(json,'$.kind'),json_extract(json,'$.state'),
  json_extract(json,'$.nextAttemptAt'),id
) WHERE COALESCE(json_extract(json,'$.exhausted'),0)=0
  AND json_extract(json,'$.state') IN ('PENDING','RUNNING');

-- Preserve the closed-window priority check without scanning completed requests.
CREATE INDEX IF NOT EXISTS v1_briefing_pending_window ON v1_feed_documents(
  feed_id,json_extract(json,'$.window.start'),json_extract(json,'$.window.end'),id
) WHERE kind='briefing_requests' AND json_extract(json,'$.state')='PENDING';

-- Expired immutable lease history must not inflate every active-owner lookup.
CREATE INDEX IF NOT EXISTS v1_semantic_lease_feed_expiry ON v1_feed_documents(
  feed_id,json_extract(json,'$.leaseUntil'),id
) WHERE kind='semantic_work_leases';
