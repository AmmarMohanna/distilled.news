CREATE TABLE v1_feeds (id TEXT PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 1, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TRIGGER v1_feed_identity BEFORE UPDATE ON v1_feeds
WHEN json_extract(NEW.json,'$.ownerId')!=json_extract(OLD.json,'$.ownerId')
 OR json_extract(NEW.json,'$.revision')<json_extract(OLD.json,'$.revision')
 OR (json_extract(NEW.json,'$.revision')=json_extract(OLD.json,'$.revision') AND NEW.json!=OLD.json)
 OR (json_extract(OLD.json,'$.deletedAt') IS NOT NULL AND NEW.json!=OLD.json)
BEGIN SELECT RAISE(ABORT,'V1_FEED_IDENTITY'); END;
CREATE TABLE v1_feed_guards(id TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT v1_feed_cas CHECK(valid=1));
CREATE TABLE v1_feed_documents (
 kind TEXT NOT NULL, id TEXT NOT NULL, feed_id TEXT NOT NULL REFERENCES v1_feeds(id),
 json TEXT NOT NULL CHECK(json_valid(json)), PRIMARY KEY(kind,id)
);
CREATE INDEX v1_feed_documents_scope ON v1_feed_documents(feed_id,kind);
CREATE TRIGGER v1_feed_document_scope BEFORE INSERT ON v1_feed_documents
WHEN EXISTS(SELECT 1 FROM v1_feed_documents WHERE kind=NEW.kind AND id=NEW.id AND feed_id!=NEW.feed_id)
BEGIN SELECT RAISE(ABORT,'V1_IDEMPOTENCY'); END;
CREATE TRIGGER v1_feed_document_immutable BEFORE UPDATE ON v1_feed_documents
WHEN OLD.kind NOT IN ('events','storylines','publication_status','delivery_jobs')
BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE UNIQUE INDEX v1_event_version_number ON v1_feed_documents(json_extract(json,'$.eventId'),json_extract(json,'$.version')) WHERE kind='event_versions';
CREATE UNIQUE INDEX v1_storyline_version_number ON v1_feed_documents(json_extract(json,'$.storylineId'),json_extract(json,'$.version')) WHERE kind='storyline_versions';
CREATE UNIQUE INDEX v1_membership_pair ON v1_feed_documents(json_extract(json,'$.eventVersionId'),json_extract(json,'$.evidenceRevisionId')) WHERE kind='memberships';
