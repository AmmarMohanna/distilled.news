CREATE INDEX v1_active_evidence_revision_scope
ON v1_evidence(json_extract(json,'$.currentRevisionId'), feed_source_id)
WHERE json_extract(json,'$.state')='ACTIVE';

CREATE INDEX connector_blocked_recovery_scope
ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedId'),
  json_extract(request,'$.scope.feedSourceId'), scheduled_at, job_id)
WHERE state='BLOCKED' AND last_error='UNCERTAIN_PAID_SUBMISSION';

CREATE INDEX accounts_enabled_admins ON accounts(role)
WHERE role='admin' AND disabled_at IS NULL;

CREATE INDEX briefings_public_explore_rank
ON briefings(stars DESC, created_at ASC, id ASC)
WHERE public_feed_enabled=1 AND paused=0;
