-- A per-feed counter that changes whenever anything a reader's edition list
-- depends on changes: an edition is written or removed, its publication
-- status is written, changed (withdrawal) or removed, or a verified delivery
-- artifact is attached or detached. Feed-page caches key on it, so a publish
-- or a withdrawal is visible on the next read without a purge.
-- Writes happen only on those rare publication events, never on job traffic.
CREATE TABLE v1_feed_read_versions (
  feed_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK(version >= 1),
  updated_at TEXT NOT NULL
);

CREATE TRIGGER v1_feed_read_version_document_added AFTER INSERT ON v1_feed_documents
WHEN NEW.kind IN ('editions','publication_status')
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at) VALUES(NEW.feed_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER v1_feed_read_version_document_changed AFTER UPDATE OF json ON v1_feed_documents
WHEN NEW.kind IN ('editions','publication_status') AND NEW.json IS NOT OLD.json
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at) VALUES(NEW.feed_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER v1_feed_read_version_document_removed AFTER DELETE ON v1_feed_documents
WHEN OLD.kind IN ('editions','publication_status')
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at) VALUES(OLD.feed_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER v1_feed_read_version_delivery_added AFTER INSERT ON v1_edition_delivery
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at) VALUES(NEW.feed_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER v1_feed_read_version_delivery_removed AFTER DELETE ON v1_edition_delivery
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at) VALUES(OLD.feed_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

-- The edition artifact backfill skips editions with an archive attempt.
CREATE INDEX v1_verified_archives_record ON v1_verified_archives(record_id,kind);
