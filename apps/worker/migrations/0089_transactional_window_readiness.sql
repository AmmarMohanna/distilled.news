-- Opt-in projection for open, clock-scheduled V3 windows. Canonical jobs and
-- briefing requests continue to own execution, authorization, and publication.
CREATE TABLE v1_window_readiness (
  window_id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES v1_feeds(id),
  feed_revision INTEGER NOT NULL CHECK(feed_revision >= 1),
  enrollment_id TEXT NOT NULL UNIQUE,
  enrollment_state TEXT NOT NULL CHECK(enrollment_state IN ('BUILDING','ACTIVE','STALE')),
  repair_after_ms INTEGER,
  cutoff TEXT NOT NULL,
  cutoff_ms INTEGER NOT NULL,
  delivery_ms INTEGER NOT NULL CHECK(delivery_ms > cutoff_ms),
  expires_ms INTEGER NOT NULL CHECK(expires_ms >= delivery_ms),
  not_before_ms INTEGER NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0),
  pending_acquisition INTEGER NOT NULL DEFAULT 0 CHECK(pending_acquisition >= 0),
  pending_review INTEGER NOT NULL DEFAULT 0 CHECK(pending_review >= 0),
  failed INTEGER NOT NULL DEFAULT 0 CHECK(failed >= 0),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked >= 0),
  capacity_eligible INTEGER NOT NULL DEFAULT 0 CHECK(capacity_eligible BETWEEN 0 AND pending_acquisition),
  collection_resolved INTEGER NOT NULL DEFAULT 0 CHECK(collection_resolved IN (0,1)),
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)),
  CHECK((enrollment_state='STALE')=(repair_after_ms IS NOT NULL))
);
CREATE INDEX v1_window_readiness_feed ON v1_window_readiness(feed_id,window_id);
CREATE INDEX v1_window_readiness_expiry ON v1_window_readiness(expires_ms,window_id);
CREATE INDEX v1_window_readiness_repair ON v1_window_readiness(repair_after_ms,window_id) WHERE enrollment_state='STALE';

-- Only unresolved jobs occupy membership rows. Terminal failures contribute to
-- the seed aggregate and the same transactional before/after deltas.
CREATE TABLE v1_window_job_memberships (
  window_id TEXT NOT NULL REFERENCES v1_window_readiness(window_id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES v1_jobs(id) ON DELETE CASCADE,
  job_revision INTEGER NOT NULL CHECK(job_revision >= 0),
  kind TEXT NOT NULL CHECK(kind IN ('ACQUISITION','REVIEW')),
  capacity_at_ms INTEGER,
  PRIMARY KEY(window_id,job_id,job_revision)
);
CREATE INDEX v1_window_membership_job ON v1_window_job_memberships(job_id,window_id);
CREATE INDEX v1_window_membership_capacity ON v1_window_job_memberships(window_id,capacity_at_ms) WHERE capacity_at_ms IS NOT NULL;
CREATE INDEX v1_window_job_observation ON v1_jobs(feed_source_id,json_extract(json,'$.observationId'))
  WHERE json_extract(json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(json,'$.state') IN ('PENDING','RUNNING','FAILED');

CREATE TABLE v1_window_ready_outbox (
  window_id TEXT PRIMARY KEY REFERENCES v1_window_readiness(window_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  generation INTEGER NOT NULL CHECK(generation >= 1),
  due_ms INTEGER NOT NULL,
  send_token TEXT,
  send_until_ms INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  sent_ms INTEGER,
  consumer_token TEXT,
  consumer_until_ms INTEGER NOT NULL DEFAULT 0,
  consumed_ms INTEGER
);
CREATE INDEX v1_window_outbox_due ON v1_window_ready_outbox(due_ms,window_id) WHERE consumed_ms IS NULL;

-- The facts view matches the canonical intake query's observation cutoff and
-- failure precedence. Only the deadline and verified-delivery exceptions are
-- time dependent. Scope revision identifies the job membership's authority.
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
  JOIN v1_intake_scopes s ON s.feed_id=w.feed_id
  JOIN v1_jobs j ON j.feed_source_id=s.id
  LEFT JOIN v1_inputs i ON i.id=json_extract(j.json,'$.observationId') AND i.feed_source_id=j.feed_source_id
  WHERE json_extract(s.json,'$.enabled')=1 AND json_extract(s.json,'$.deletedAt') IS NULL
    AND json_extract(j.json,'$.kind') IN ('ACQUIRE','REASSESS')
    AND json_extract(j.json,'$.state') IN ('PENDING','RUNNING','FAILED')
    AND (json_extract(i.json,'$.observation.observedAt') IS NULL OR julianday(json_extract(i.json,'$.observation.observedAt'))<julianday(w.cutoff))
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

-- A ready event only wakes the canonical relay. Collection must have been
-- evaluated, review complete, and an acquisition wait either resolved or
-- releasable at the recorded deadline. A verified result wakes at delivery.
CREATE TRIGGER v1_window_refresh_outbox AFTER UPDATE OF generation ON v1_window_readiness
WHEN NEW.generation<>OLD.generation
BEGIN
  DELETE FROM v1_window_ready_outbox WHERE window_id=NEW.window_id;
  INSERT INTO v1_window_ready_outbox(window_id,event_id,generation,due_ms)
  SELECT NEW.window_id,'window-ready:'||NEW.window_id||':'||NEW.enrollment_id||':'||NEW.generation,NEW.generation,
    MAX(NEW.not_before_ms,CASE WHEN NEW.verified=1 THEN NEW.delivery_ms ELSE MAX(NEW.cutoff_ms,
      COALESCE((SELECT MAX(capacity_at_ms) FROM v1_window_job_memberships WHERE window_id=NEW.window_id AND capacity_at_ms IS NOT NULL),NEW.cutoff_ms)) END)
  WHERE NEW.enrollment_state='ACTIVE' AND NEW.collection_resolved=1 AND NEW.pending_review=0
    AND (NEW.verified=1 OR NEW.pending_acquisition=NEW.capacity_eligible);
END;

-- Apply one canonical row's contribution with the old row still visible on
-- removal and the new row visible on addition. The writable view adds no
-- journal writes. All effects roll back with the existing lease/epoch guards.
CREATE VIEW v1_window_job_delta AS SELECT '' AS job_id,0 AS direction WHERE 0;
CREATE VIEW v1_active_window_readiness AS
SELECT window_id,feed_id FROM v1_window_readiness
WHERE enrollment_state='ACTIVE' AND expires_ms>unixepoch('now','subsec')*1000;
CREATE TRIGGER v1_window_apply_job_delta INSTEAD OF INSERT ON v1_window_job_delta
BEGIN
  DELETE FROM v1_window_job_memberships
  WHERE NEW.direction=-1 AND job_id=NEW.job_id;
  INSERT INTO v1_window_job_memberships(window_id,job_id,job_revision,kind,capacity_at_ms)
  SELECT m.window_id,m.job_id,m.job_revision,m.bucket,m.capacity_at_ms
  FROM v1_window_job_matches m JOIN v1_active_window_readiness w ON w.window_id=m.window_id
  WHERE NEW.direction=1 AND m.job_id=NEW.job_id AND m.bucket IN ('ACQUISITION','REVIEW');
  UPDATE v1_window_readiness SET
    pending_acquisition=pending_acquisition+NEW.direction*(m.bucket='ACQUISITION'),
    pending_review=pending_review+NEW.direction*(m.bucket='REVIEW'),
    failed=failed+NEW.direction*(m.bucket='FAILED'),
    blocked=blocked+NEW.direction*(m.bucket='BLOCKED'),
    capacity_eligible=capacity_eligible+NEW.direction*(m.capacity_at_ms IS NOT NULL),
    generation=generation+1
  FROM v1_window_job_matches m
  WHERE v1_window_readiness.window_id=m.window_id AND m.job_id=NEW.job_id
    AND v1_window_readiness.enrollment_state='ACTIVE' AND v1_window_readiness.expires_ms>unixepoch('now','subsec')*1000;
END;

CREATE TRIGGER v1_window_job_added AFTER INSERT ON v1_jobs
WHEN EXISTS(SELECT 1 FROM v1_active_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=NEW.feed_source_id))
BEGIN INSERT INTO v1_window_job_delta VALUES(NEW.id,1); END;
CREATE TRIGGER v1_window_job_before_change BEFORE UPDATE OF json ON v1_jobs
WHEN EXISTS(SELECT 1 FROM v1_active_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=OLD.feed_source_id))
 AND json_extract(OLD.json,'$.kind','$.state','$.exhausted','$.failureCode','$.failureDetail','$.leaseUntil','$.observationId')
  IS NOT json_extract(NEW.json,'$.kind','$.state','$.exhausted','$.failureCode','$.failureDetail','$.leaseUntil','$.observationId')
BEGIN INSERT INTO v1_window_job_delta VALUES(OLD.id,-1); END;
CREATE TRIGGER v1_window_job_changed AFTER UPDATE OF json ON v1_jobs
WHEN EXISTS(SELECT 1 FROM v1_active_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=NEW.feed_source_id))
 AND json_extract(OLD.json,'$.kind','$.state','$.exhausted','$.failureCode','$.failureDetail','$.leaseUntil','$.observationId')
  IS NOT json_extract(NEW.json,'$.kind','$.state','$.exhausted','$.failureCode','$.failureDetail','$.leaseUntil','$.observationId')
BEGIN INSERT INTO v1_window_job_delta VALUES(NEW.id,1); END;
CREATE TRIGGER v1_window_job_removed BEFORE DELETE ON v1_jobs
WHEN EXISTS(SELECT 1 FROM v1_active_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=OLD.feed_source_id))
BEGIN INSERT INTO v1_window_job_delta VALUES(OLD.id,-1); END;

-- Edits retire the projection only. The next observation seeds the still
-- authoritative request under a fresh enrollment identity. Epoch bookkeeping
-- does not invalidate the projection.
CREATE TRIGGER v1_window_feed_changed AFTER UPDATE OF json ON v1_feeds
WHEN OLD.json IS NOT NEW.json
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=NEW.id; END;
CREATE TRIGGER v1_window_scope_changed AFTER UPDATE OF json ON v1_intake_scopes
WHEN OLD.json IS NOT NEW.json
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=NEW.feed_id; END;
CREATE TRIGGER v1_window_scope_added AFTER INSERT ON v1_intake_scopes
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=NEW.feed_id; END;
CREATE TRIGGER v1_window_scope_removed AFTER DELETE ON v1_intake_scopes
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=OLD.feed_id; END;

-- Normal intake writes the immutable observation before its job. For imports
-- and cleanup, an observation arriving or disappearing after the job existed
-- changes cutoff membership and requires a new seed.
CREATE TRIGGER v1_window_input_added AFTER INSERT ON v1_inputs
WHEN EXISTS(SELECT 1 FROM v1_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=NEW.feed_source_id))
 AND EXISTS(SELECT 1 FROM v1_jobs WHERE feed_source_id=NEW.feed_source_id AND json_extract(json,'$.observationId')=NEW.id
   AND json_extract(json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(json,'$.state') IN ('PENDING','RUNNING','FAILED'))
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=NEW.feed_source_id); END;
CREATE TRIGGER v1_window_input_removed AFTER DELETE ON v1_inputs
WHEN EXISTS(SELECT 1 FROM v1_window_readiness w WHERE w.feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=OLD.feed_source_id))
 AND EXISTS(SELECT 1 FROM v1_jobs WHERE feed_source_id=OLD.feed_source_id AND json_extract(json,'$.observationId')=OLD.id
   AND json_extract(json,'$.kind') IN ('ACQUIRE','REASSESS') AND json_extract(json,'$.state') IN ('PENDING','RUNNING','FAILED'))
BEGIN DELETE FROM v1_window_readiness WHERE feed_id=(SELECT feed_id FROM v1_intake_scopes WHERE id=OLD.feed_source_id); END;

CREATE TRIGGER v1_window_request_changed AFTER UPDATE OF json ON v1_feed_documents
WHEN NEW.kind='briefing_requests' AND EXISTS(SELECT 1 FROM v1_window_readiness WHERE window_id=NEW.id)
BEGIN
  DELETE FROM v1_window_readiness WHERE window_id=NEW.id AND (
    json_extract(NEW.json,'$.state') IS NOT 'PENDING' OR json_extract(NEW.json,'$.engine') IS NOT 'v3'
    OR json_extract(OLD.json,'$.window') IS NOT json_extract(NEW.json,'$.window')
    OR json_extract(OLD.json,'$.v3InputId') IS NOT json_extract(NEW.json,'$.v3InputId'));
  UPDATE v1_window_readiness SET not_before_ms=MAX(cutoff_ms,COALESCE(CAST(ROUND(unixepoch(json_extract(NEW.json,'$.nextAttemptAt'),'subsec')*1000) AS INTEGER),cutoff_ms)),
    verified=CASE WHEN json_extract(NEW.json,'$.reason')='AWAITING_SCHEDULED_DELIVERY' THEN verified ELSE 0 END,
    generation=generation+1
  WHERE window_id=NEW.id AND (json_extract(OLD.json,'$.nextAttemptAt') IS NOT json_extract(NEW.json,'$.nextAttemptAt')
    OR json_extract(OLD.json,'$.reason') IS NOT json_extract(NEW.json,'$.reason'));
END;
CREATE TRIGGER v1_window_request_removed AFTER DELETE ON v1_feed_documents
WHEN OLD.kind='briefing_requests'
BEGIN DELETE FROM v1_window_readiness WHERE window_id=OLD.id; END;
