CREATE TABLE v1_feed_versions(id TEXT PRIMARY KEY,feed_id TEXT NOT NULL,revision INTEGER NOT NULL,json TEXT NOT NULL CHECK(json_valid(json)),UNIQUE(feed_id,revision));
CREATE TRIGGER v1_feed_version_immutable BEFORE UPDATE ON v1_feed_versions BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
CREATE TRIGGER v1_feed_version_insert AFTER INSERT ON v1_feeds BEGIN INSERT INTO v1_feed_versions(id,feed_id,revision,json) VALUES(NEW.id||':'||json_extract(NEW.json,'$.revision'),NEW.id,json_extract(NEW.json,'$.revision'),NEW.json); END;
CREATE TRIGGER v1_feed_version_update AFTER UPDATE ON v1_feeds WHEN NEW.json!=OLD.json BEGIN INSERT INTO v1_feed_versions(id,feed_id,revision,json) VALUES(NEW.id||':'||json_extract(NEW.json,'$.revision'),NEW.id,json_extract(NEW.json,'$.revision'),NEW.json); END;
INSERT INTO v1_feed_versions(id,feed_id,revision,json) SELECT id||':'||json_extract(json,'$.revision'),id,json_extract(json,'$.revision'),json FROM v1_feeds;
