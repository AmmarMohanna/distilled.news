-- References are installed only after reading back and verifying the private
-- object. An upload intent makes abandoned objects recoverable by exact key.
CREATE TABLE v1_verified_archives (
  object_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('EDITION','SEMANTIC_WAIT')),
  feed_id TEXT NOT NULL REFERENCES v1_feeds(id),
  record_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
  byte_count INTEGER NOT NULL CHECK(byte_count>0 AND byte_count<=4194304),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  state TEXT NOT NULL CHECK(state IN ('WRITING','VERIFIED','REFERENCED','DELETING')),
  cleanup_after_ms INTEGER NOT NULL,
  verified_ms INTEGER
);
CREATE INDEX v1_verified_archives_cleanup ON v1_verified_archives(cleanup_after_ms,object_key)
  WHERE state IN ('WRITING','VERIFIED','DELETING');
CREATE INDEX v1_uncompacted_semantic_waits ON v1_feed_documents(id)
  WHERE kind='semantic_resource_waits' AND json_extract(json,'$.status')='DEFERRED'
    AND json_extract(json,'$.usage.calls')=0 AND json_extract(json,'$.usage.costUsd')=0
    AND json_type(json,'$.usage.reported')='true' AND json_type(json,'$.input.state') IS NOT NULL
    AND json_extract(json,'$.archiveSchemaVersion') IS NOT 1;

CREATE TABLE v1_edition_delivery (
  edition_id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES v1_feeds(id),
  object_key TEXT NOT NULL UNIQUE REFERENCES v1_verified_archives(object_key),
  created_at TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE INDEX v1_edition_delivery_recent ON v1_edition_delivery(feed_id,created_at DESC,edition_id DESC);
CREATE TABLE v1_edition_delivery_latest (
  feed_id TEXT PRIMARY KEY REFERENCES v1_feeds(id),
  edition_id TEXT NOT NULL REFERENCES v1_edition_delivery(edition_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE v1_semantic_wait_archive_refs (
  wait_id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES v1_feeds(id),
  object_key TEXT NOT NULL UNIQUE REFERENCES v1_verified_archives(object_key)
);

CREATE TRIGGER v1_edition_delivery_verified BEFORE INSERT ON v1_edition_delivery
WHEN NOT EXISTS(SELECT 1 FROM v1_verified_archives a WHERE a.object_key=NEW.object_key AND a.feed_id=NEW.feed_id
  AND a.record_id=NEW.edition_id AND a.kind='EDITION' AND a.state='VERIFIED' AND a.verified_ms IS NOT NULL
  AND a.cleanup_after_ms>unixepoch('now','subsec')*1000)
 OR NOT EXISTS(SELECT 1 FROM v1_feed_documents e
  JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=e.id AND p.feed_id=e.feed_id
  JOIN v1_feed_documents j ON j.kind='delivery_jobs' AND j.id=e.id AND j.feed_id=e.feed_id
  WHERE e.kind='editions' AND e.id=NEW.edition_id AND e.feed_id=NEW.feed_id
    AND json_extract(e.json,'$.engine')='v3' AND json_extract(e.json,'$.createdAt')=NEW.created_at
    AND json_extract(p.json,'$.status')='PUBLISHED' AND json_extract(p.json,'$.publishedAt')=NEW.published_at)
BEGIN SELECT RAISE(ABORT,'V1_EDITION_ARTIFACT_NOT_VERIFIED'); END;

CREATE TRIGGER v1_edition_delivery_added AFTER INSERT ON v1_edition_delivery
BEGIN
  UPDATE v1_verified_archives SET state='REFERENCED' WHERE object_key=NEW.object_key;
  INSERT INTO v1_edition_delivery_latest(feed_id,edition_id,created_at) VALUES(NEW.feed_id,NEW.edition_id,NEW.created_at)
    ON CONFLICT(feed_id) DO UPDATE SET edition_id=excluded.edition_id,created_at=excluded.created_at
    WHERE (excluded.created_at,excluded.edition_id)>(v1_edition_delivery_latest.created_at,v1_edition_delivery_latest.edition_id);
END;

CREATE VIEW v1_visible_edition_delivery AS
SELECT d.* FROM v1_edition_delivery d
JOIN v1_feed_documents p ON p.kind='publication_status' AND p.id=d.edition_id AND p.feed_id=d.feed_id
WHERE json_extract(p.json,'$.status')='PUBLISHED' AND json_extract(p.json,'$.publishedAt')=d.published_at;

CREATE TRIGGER v1_edition_delivery_visibility AFTER UPDATE OF json ON v1_feed_documents
WHEN NEW.kind='publication_status'
 AND json_extract(OLD.json,'$.status','$.publishedAt') IS NOT json_extract(NEW.json,'$.status','$.publishedAt')
 AND EXISTS(SELECT 1 FROM v1_edition_delivery WHERE edition_id=NEW.id AND feed_id=NEW.feed_id)
BEGIN
  DELETE FROM v1_edition_delivery_latest WHERE feed_id=NEW.feed_id;
  INSERT INTO v1_edition_delivery_latest SELECT feed_id,edition_id,created_at FROM v1_visible_edition_delivery
    WHERE feed_id=NEW.feed_id ORDER BY created_at DESC,edition_id DESC LIMIT 1;
END;
CREATE TRIGGER v1_edition_delivery_record_removed AFTER DELETE ON v1_feed_documents
WHEN OLD.kind='editions' OR OLD.kind='publication_status'
BEGIN
  DELETE FROM v1_edition_delivery WHERE edition_id=OLD.id AND feed_id=OLD.feed_id;
END;
CREATE TRIGGER v1_edition_delivery_removed AFTER DELETE ON v1_edition_delivery
BEGIN
  UPDATE v1_verified_archives SET state='VERIFIED',cleanup_after_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER)+86400000
    WHERE object_key=OLD.object_key;
  INSERT INTO v1_edition_delivery_latest SELECT feed_id,edition_id,created_at FROM v1_visible_edition_delivery
    WHERE feed_id=OLD.feed_id AND NOT EXISTS(SELECT 1 FROM v1_edition_delivery_latest WHERE feed_id=OLD.feed_id)
    ORDER BY created_at DESC,edition_id DESC LIMIT 1;
END;

CREATE TRIGGER v1_wait_archive_verified BEFORE INSERT ON v1_semantic_wait_archive_refs
WHEN NOT EXISTS(SELECT 1 FROM v1_verified_archives a WHERE a.object_key=NEW.object_key AND a.feed_id=NEW.feed_id
  AND a.record_id=NEW.wait_id AND a.kind='SEMANTIC_WAIT' AND a.state='VERIFIED' AND a.verified_ms IS NOT NULL
  AND a.cleanup_after_ms>unixepoch('now','subsec')*1000)
 OR NOT EXISTS(SELECT 1 FROM v1_feed_documents d WHERE d.kind='semantic_resource_waits' AND d.id=NEW.wait_id
   AND d.feed_id=NEW.feed_id AND json_extract(d.json,'$.archiveKey')=NEW.object_key)
BEGIN SELECT RAISE(ABORT,'V1_WAIT_ARCHIVE_NOT_VERIFIED'); END;
CREATE TRIGGER v1_wait_archive_added AFTER INSERT ON v1_semantic_wait_archive_refs
BEGIN UPDATE v1_verified_archives SET state='REFERENCED' WHERE object_key=NEW.object_key; END;
CREATE TRIGGER v1_wait_archive_record_removed AFTER DELETE ON v1_feed_documents
WHEN OLD.kind='semantic_resource_waits'
BEGIN DELETE FROM v1_semantic_wait_archive_refs WHERE wait_id=OLD.id AND feed_id=OLD.feed_id; END;
CREATE TRIGGER v1_wait_archive_removed AFTER DELETE ON v1_semantic_wait_archive_refs
BEGIN
  UPDATE v1_verified_archives SET state='VERIFIED',cleanup_after_ms=CAST(unixepoch('now','subsec')*1000 AS INTEGER)+86400000
    WHERE object_key=OLD.object_key;
END;
