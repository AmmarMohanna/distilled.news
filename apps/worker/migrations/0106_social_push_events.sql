CREATE TABLE account_star_alerts (
  feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  PRIMARY KEY (feed_id, account_id)
);

ALTER TABLE channel_follows ADD COLUMN followed_at TEXT;

CREATE TABLE social_push_events (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('feed-added', 'feed-edited', 'briefing')),
  edition_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX social_push_events_order ON social_push_events(created_at, id);
CREATE TABLE social_push_receipts (
  event_id TEXT NOT NULL REFERENCES social_push_events(id) ON DELETE CASCADE,
  subscription_version TEXT NOT NULL,
  PRIMARY KEY(event_id, subscription_version)
);

CREATE TRIGGER social_push_feed_insert AFTER INSERT ON briefings
WHEN NEW.public_feed_enabled=1 AND NEW.paused=0
 AND EXISTS(SELECT 1 FROM channel_follows WHERE channel_id=NEW.owner_account_id)
BEGIN
  INSERT INTO social_push_events(id,feed_id,kind,created_at)
  VALUES(lower(hex(randomblob(16))),NEW.id,'feed-added',NEW.created_at);
END;

CREATE TRIGGER social_push_feed_edit AFTER UPDATE OF slug,title,interest_profile,style_instruction,
  public_feed_enabled,language,intensity,briefing_cadence,briefing_time_of_day,briefing_timezone,v1_briefing_interval_minutes ON briefings
WHEN NEW.public_feed_enabled=1 AND NEW.paused=0
 AND EXISTS(SELECT 1 FROM channel_follows WHERE channel_id=NEW.owner_account_id)
 AND (NEW.slug IS NOT OLD.slug OR NEW.title IS NOT OLD.title OR NEW.interest_profile IS NOT OLD.interest_profile
  OR NEW.style_instruction IS NOT OLD.style_instruction OR NEW.public_feed_enabled IS NOT OLD.public_feed_enabled
  OR NEW.language IS NOT OLD.language OR NEW.intensity IS NOT OLD.intensity
  OR NEW.briefing_cadence IS NOT OLD.briefing_cadence OR NEW.briefing_time_of_day IS NOT OLD.briefing_time_of_day
  OR NEW.briefing_timezone IS NOT OLD.briefing_timezone OR NEW.v1_briefing_interval_minutes IS NOT OLD.v1_briefing_interval_minutes)
BEGIN
  INSERT OR IGNORE INTO social_push_events(id,feed_id,kind,created_at)
  VALUES(json_array('feed-change',NEW.id,NEW.updated_at),NEW.id,CASE WHEN OLD.public_feed_enabled=0 THEN 'feed-added' ELSE 'feed-edited' END,NEW.updated_at);
END;

CREATE TRIGGER social_push_briefing_insert AFTER INSERT ON v1_feed_documents
WHEN NEW.kind='publication_status' AND json_extract(NEW.json,'$.status')='PUBLISHED'
 AND EXISTS(SELECT 1 FROM briefings WHERE id=NEW.feed_id AND public_feed_enabled=1 AND paused=0)
 AND EXISTS(SELECT 1 FROM account_star_alerts WHERE feed_id=NEW.feed_id AND started_at<json_extract(NEW.json,'$.publishedAt'))
BEGIN
  INSERT OR IGNORE INTO social_push_events(id,feed_id,kind,edition_id,created_at)
  VALUES(json_array('briefing',NEW.feed_id,NEW.id),NEW.feed_id,'briefing',NEW.id,json_extract(NEW.json,'$.publishedAt'));
END;

CREATE TRIGGER social_push_briefing_update AFTER UPDATE OF json ON v1_feed_documents
WHEN NEW.kind='publication_status' AND json_extract(NEW.json,'$.status')='PUBLISHED' AND json_extract(OLD.json,'$.status') IS NOT 'PUBLISHED'
 AND EXISTS(SELECT 1 FROM briefings WHERE id=NEW.feed_id AND public_feed_enabled=1 AND paused=0)
 AND EXISTS(SELECT 1 FROM account_star_alerts WHERE feed_id=NEW.feed_id AND started_at<json_extract(NEW.json,'$.publishedAt'))
BEGIN
  INSERT OR IGNORE INTO social_push_events(id,feed_id,kind,edition_id,created_at)
  VALUES(json_array('briefing',NEW.feed_id,NEW.id),NEW.feed_id,'briefing',NEW.id,json_extract(NEW.json,'$.publishedAt'));
END;
