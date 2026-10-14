-- A cheap retry/relay tick must not reenroll every source on each Cron minute.
-- The generation fence retains configuration changes occurring during work.
ALTER TABLE connector_feed_schedule ADD COLUMN collection_due_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connector_feed_schedule ADD COLUMN collection_epoch INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER connector_schedule_insert;
DROP TRIGGER connector_schedule_change;
DROP TRIGGER connector_schedule_feed_change;
CREATE TRIGGER connector_schedule_insert AFTER INSERT ON sources WHEN NEW.collection_owner='connector'
BEGIN INSERT INTO connector_feed_schedule(feed_id) VALUES(NEW.briefing_id) ON CONFLICT(feed_id) DO UPDATE SET due_ms=0,collection_due_ms=0,collection_epoch=collection_epoch+1; END;
CREATE TRIGGER connector_schedule_change AFTER UPDATE OF title,enabled,input,source_url,kind,provider,actor_id,collection_owner ON sources
WHEN NEW.collection_owner='connector'
BEGIN INSERT INTO connector_feed_schedule(feed_id) VALUES(NEW.briefing_id) ON CONFLICT(feed_id) DO UPDATE SET due_ms=0,collection_due_ms=0,collection_epoch=collection_epoch+1; END;
CREATE TRIGGER connector_schedule_feed_change AFTER UPDATE OF title,paused,interest_profile,language,briefing_cadence,v1_briefing_interval_minutes,briefing_timezone,briefing_time_of_day ON briefings
BEGIN UPDATE connector_feed_schedule SET due_ms=0,collection_due_ms=0,collection_epoch=collection_epoch+1 WHERE feed_id=NEW.id; END;
