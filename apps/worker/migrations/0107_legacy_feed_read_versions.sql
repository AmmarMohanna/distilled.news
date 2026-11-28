-- Keep loaded pages stable across status refreshes and invalidate them when a
-- legacy edition changes. Product publication writes use the existing triggers.
CREATE TRIGGER legacy_feed_read_version_insert AFTER INSERT ON briefing_editions
WHEN NEW.status = 'published'
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at)
  VALUES(NEW.briefing_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER legacy_feed_read_version_update AFTER UPDATE OF title,summary,sections_json,status,published_at,updated_at ON briefing_editions
WHEN (OLD.status = 'published' OR NEW.status = 'published') AND (
  OLD.title IS NOT NEW.title OR OLD.summary IS NOT NEW.summary OR OLD.sections_json IS NOT NEW.sections_json OR
  OLD.status IS NOT NEW.status OR OLD.published_at IS NOT NEW.published_at OR OLD.updated_at IS NOT NEW.updated_at
)
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at)
  VALUES(NEW.briefing_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;

CREATE TRIGGER legacy_feed_read_version_delete AFTER DELETE ON briefing_editions
WHEN OLD.status = 'published'
BEGIN
  INSERT INTO v1_feed_read_versions(feed_id,version,updated_at)
  VALUES(OLD.briefing_id,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(feed_id) DO UPDATE SET version=version+1,updated_at=excluded.updated_at;
END;
