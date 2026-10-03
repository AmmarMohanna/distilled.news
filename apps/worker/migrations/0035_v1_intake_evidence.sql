CREATE TABLE v1_intake_scopes (
  id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, source_id TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1 CHECK(epoch >= 1), json TEXT NOT NULL CHECK(json_valid(json))
);
CREATE TRIGGER v1_scope_identity BEFORE UPDATE ON v1_intake_scopes
WHEN NEW.feed_id != OLD.feed_id OR NEW.source_id != OLD.source_id
BEGIN SELECT RAISE(ABORT, 'V1_SCOPE_REBIND'); END;
CREATE TRIGGER v1_scope_revision BEFORE UPDATE ON v1_intake_scopes
WHEN json_extract(NEW.json,'$.feedRevision') < json_extract(OLD.json,'$.feedRevision')
 OR (json_extract(NEW.json,'$.feedRevision') = json_extract(OLD.json,'$.feedRevision')
 AND json_extract(NEW.json,'$.restrictions') != json_extract(OLD.json,'$.restrictions'))
 OR (json_extract(OLD.json,'$.deletedAt') IS NOT NULL AND NEW.json != OLD.json)
BEGIN SELECT RAISE(ABORT, 'V1_SCOPE_REVISION'); END;
CREATE TABLE v1_transaction_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT v1_cas CHECK(valid = 1));
CREATE TABLE v1_handoffs (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_inputs (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_candidates (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT NOT NULL, json TEXT NOT NULL CHECK(json_valid(json)), UNIQUE(feed_source_id,item_key));
CREATE TABLE v1_intake_receipts (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TRIGGER v1_terminal_intake_receipt BEFORE UPDATE ON v1_intake_receipts
WHEN json_extract(OLD.json,'$.decision') != 'QUARANTINED' AND NEW.json != OLD.json
BEGIN SELECT RAISE(ABORT, 'V1_TERMINAL_RECEIPT'); END;
CREATE TABLE v1_jobs (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_evidence (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT NOT NULL, json TEXT NOT NULL CHECK(json_valid(json)), UNIQUE(feed_source_id,item_key));
CREATE TABLE v1_revisions (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE UNIQUE INDEX v1_revision_number ON v1_revisions(json_extract(json,'$.evidenceId'),json_extract(json,'$.revision'));
CREATE TABLE v1_tombstones (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_acquired (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_evidence_receipts (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TABLE v1_conflicts (id TEXT PRIMARY KEY, feed_source_id TEXT NOT NULL REFERENCES v1_intake_scopes(id), item_key TEXT, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE INDEX v1_jobs_scope ON v1_jobs(feed_source_id);
CREATE INDEX v1_inputs_scope ON v1_inputs(feed_source_id);
CREATE INDEX v1_revisions_scope ON v1_revisions(feed_source_id);
CREATE INDEX v1_conflicts_scope ON v1_conflicts(feed_source_id);
CREATE TRIGGER v1_input_immutable BEFORE UPDATE ON v1_inputs BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_handoff_immutable BEFORE UPDATE ON v1_handoffs BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_revision_immutable BEFORE UPDATE ON v1_revisions BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_tombstone_immutable BEFORE UPDATE ON v1_tombstones BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_acquired_immutable BEFORE UPDATE ON v1_acquired BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_evidence_receipt_immutable BEFORE UPDATE ON v1_evidence_receipts BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_input_scope BEFORE INSERT ON v1_inputs WHEN EXISTS(SELECT 1 FROM v1_inputs WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id) BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE TRIGGER v1_acquired_scope BEFORE INSERT ON v1_acquired WHEN EXISTS(SELECT 1 FROM v1_acquired WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id) BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE TRIGGER v1_receipt_scope BEFORE INSERT ON v1_intake_receipts WHEN EXISTS(SELECT 1 FROM v1_intake_receipts WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id) BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE TRIGGER v1_evidence_receipt_scope BEFORE INSERT ON v1_evidence_receipts WHEN EXISTS(SELECT 1 FROM v1_evidence_receipts WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id) BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE TRIGGER v1_job_scope BEFORE INSERT ON v1_jobs WHEN EXISTS(SELECT 1 FROM v1_jobs WHERE id=NEW.id AND feed_source_id!=NEW.feed_source_id) BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
