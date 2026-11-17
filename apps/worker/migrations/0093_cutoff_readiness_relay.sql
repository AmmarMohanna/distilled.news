-- Both policies keep the same unresolved job memberships. Only the cutoff
-- edition can wake the canonical relay while those jobs still hold coverage.
ALTER TABLE v1_window_readiness ADD COLUMN defer_intake INTEGER NOT NULL DEFAULT 0 CHECK(defer_intake IN (0,1));

DROP TRIGGER v1_window_refresh_outbox;
CREATE TRIGGER v1_window_refresh_outbox AFTER UPDATE OF generation ON v1_window_readiness
WHEN NEW.generation<>OLD.generation
BEGIN
  DELETE FROM v1_window_ready_outbox WHERE window_id=NEW.window_id;
  INSERT INTO v1_window_ready_outbox(window_id,event_id,generation,due_ms)
  SELECT NEW.window_id,'window-ready:'||NEW.window_id||':'||NEW.enrollment_id||':'||NEW.generation,NEW.generation,
    MAX(NEW.not_before_ms,CASE WHEN NEW.verified=1 THEN NEW.delivery_ms WHEN NEW.defer_intake=1 THEN NEW.cutoff_ms
      ELSE MAX(NEW.cutoff_ms,COALESCE((SELECT MAX(capacity_at_ms) FROM v1_window_job_memberships
        WHERE window_id=NEW.window_id AND capacity_at_ms IS NOT NULL),NEW.cutoff_ms)) END)
  WHERE NEW.enrollment_state='ACTIVE' AND NEW.collection_resolved=1
    AND (NEW.defer_intake=1 OR (NEW.pending_review=0 AND (NEW.verified=1 OR NEW.pending_acquisition=NEW.capacity_eligible)));
END;
