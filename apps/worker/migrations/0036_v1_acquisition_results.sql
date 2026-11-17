CREATE TABLE v1_acquisition_results (
 id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id),
 item_key TEXT NOT NULL, json TEXT NOT NULL CHECK(json_valid(json))
);
CREATE TRIGGER v1_acquisition_result_immutable BEFORE UPDATE ON v1_acquisition_results
BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_acquisition_result_scope BEFORE INSERT ON v1_acquisition_results
WHEN EXISTS(SELECT 1 FROM v1_acquisition_results WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id)
BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE INDEX v1_acquisition_due ON v1_jobs(json_extract(json,'$.kind'),json_extract(json,'$.state'),json_extract(json,'$.nextAttemptAt'));
