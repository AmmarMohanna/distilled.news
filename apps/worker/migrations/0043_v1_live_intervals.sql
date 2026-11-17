-- Additive live-v1 duration. Historical cadence/edition tables stay untouched.
ALTER TABLE briefings ADD COLUMN v1_briefing_interval_minutes INTEGER CHECK (v1_briefing_interval_minutes IN (30,60,120,360,720,1440));
-- Schedule changes fence existing intake/provider work just like timezone and
-- legacy cadence edits. Trusted enrollment revalidates the new configuration.
CREATE TRIGGER v1_product_live_interval_update AFTER UPDATE OF v1_briefing_interval_minutes ON briefings WHEN NEW.v1_briefing_interval_minutes IS NOT OLD.v1_briefing_interval_minutes BEGIN UPDATE v1_feeds SET json=json_set(json,'$.paused',json('true'),'$.revision',json_extract(json,'$.revision')+1,'$.updatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now')),epoch=epoch+1 WHERE id=NEW.id AND json_extract(json,'$.deletedAt') IS NULL; UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',json('false')),epoch=epoch+1 WHERE feed_id=NEW.id AND json_extract(json,'$.deletedAt') IS NULL; END;
-- Existing product cadence controls remain authoritative when explicitly
-- changed. A simultaneous live interval/cadence edit retains its new interval.
CREATE TRIGGER v1_product_legacy_cadence_update AFTER UPDATE OF briefing_cadence ON briefings WHEN NEW.briefing_cadence!=OLD.briefing_cadence AND NEW.v1_briefing_interval_minutes IS OLD.v1_briefing_interval_minutes AND NEW.v1_briefing_interval_minutes IS NOT NULL BEGIN UPDATE briefings SET v1_briefing_interval_minutes=NULL WHERE id=NEW.id; END;
