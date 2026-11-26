CREATE TABLE connector_batch_uploads (
  object_key TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL,
  feed_source_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('WRITING','VERIFIED','DELETING','QUARANTINED')),
  cleanup_at INTEGER NOT NULL
);
CREATE INDEX connector_batch_uploads_due ON connector_batch_uploads(cleanup_at) WHERE state<>'QUARANTINED';

-- Claim and attachment are mutually exclusive in D1, including a writer
-- that finishes after its upload lease has expired.
CREATE TRIGGER connector_rss_upload_guard BEFORE INSERT ON connector_batches
WHEN json_extract(NEW.data,'$.archiveRef') LIKE 'connector-batches/v2/%'
  AND NOT EXISTS (SELECT 1 FROM connector_batch_uploads WHERE object_key=json_extract(NEW.data,'$.archiveRef')
    AND feed_id=NEW.feed_id AND feed_source_id=NEW.feed_source_id AND state='VERIFIED' AND cleanup_at>unixepoch())
BEGIN SELECT RAISE(ABORT,'CONNECTOR_UPLOAD_NOT_VERIFIED'); END;

CREATE TRIGGER connector_provider_upload_guard BEFORE INSERT ON connector_provider_batches
WHEN json_extract(NEW.data,'$.archiveRef') LIKE 'connector-batches/v2/%'
  AND NOT EXISTS (SELECT 1 FROM connector_batch_uploads WHERE object_key=json_extract(NEW.data,'$.archiveRef')
    AND feed_id=NEW.feed_id AND feed_source_id=NEW.feed_source_id AND state='VERIFIED' AND cleanup_at>unixepoch())
BEGIN SELECT RAISE(ABORT,'CONNECTOR_UPLOAD_NOT_VERIFIED'); END;

CREATE TRIGGER connector_rss_upload_attached AFTER INSERT ON connector_batches
WHEN json_extract(NEW.data,'$.archiveRef') LIKE 'connector-batches/v2/%'
BEGIN DELETE FROM connector_batch_uploads WHERE object_key=json_extract(NEW.data,'$.archiveRef'); END;

CREATE TRIGGER connector_provider_upload_attached AFTER INSERT ON connector_provider_batches
WHEN json_extract(NEW.data,'$.archiveRef') LIKE 'connector-batches/v2/%'
BEGIN DELETE FROM connector_batch_uploads WHERE object_key=json_extract(NEW.data,'$.archiveRef'); END;

ALTER TABLE connector_batch_expiry ADD COLUMN retry_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connector_batch_expiry ADD COLUMN quarantine_reason TEXT;
CREATE INDEX connector_batch_expiry_runnable ON connector_batch_expiry(expires_at) WHERE quarantine_reason IS NULL;

CREATE TABLE connector_storage_recovery (
  id INTEGER PRIMARY KEY CHECK(id=1),
  token TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  until_ms INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PROBING','READY','CONSUMED')),
  allocated_bytes INTEGER NOT NULL
);
CREATE TABLE connector_storage_probe (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);
