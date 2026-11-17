-- Indexed fair dispatch for the helper's single Telegram session.
ALTER TABLE connector_feed_schedule ADD COLUMN telegram_due_ms INTEGER NOT NULL DEFAULT 9007199254740991;
ALTER TABLE connector_feed_schedule ADD COLUMN telegram_dispatched_ms INTEGER NOT NULL DEFAULT 0;
CREATE INDEX connector_telegram_feed_due ON connector_feed_schedule(telegram_due_ms,telegram_dispatched_ms,feed_id);
CREATE INDEX connector_telegram_pending_feed ON connector_provider_poll_jobs(json_extract(request,'$.scope.feedId'),due_at,dispatch_until,lease_until)
WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram';
CREATE INDEX connector_telegram_dispatched ON connector_provider_poll_jobs(dispatch_until)
WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram';
CREATE TRIGGER connector_telegram_insert AFTER INSERT ON connector_provider_poll_jobs
WHEN NEW.state='PENDING' AND json_extract(NEW.request,'$.source.family')='telegram'
BEGIN UPDATE connector_feed_schedule SET telegram_due_ms=MIN(telegram_due_ms,CAST((julianday(NEW.due_at)-2440587.5)*86400000 AS INTEGER)) WHERE feed_id=json_extract(NEW.request,'$.scope.feedId'); END;
CREATE TRIGGER connector_telegram_change AFTER UPDATE OF state,due_at,request ON connector_provider_poll_jobs
WHEN json_extract(NEW.request,'$.source.family')='telegram' OR json_extract(OLD.request,'$.source.family')='telegram'
BEGIN UPDATE connector_feed_schedule SET telegram_due_ms=COALESCE((SELECT CAST((julianday(due_at)-2440587.5)*86400000 AS INTEGER)
FROM connector_provider_poll_jobs WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram'
AND json_extract(request,'$.scope.feedId')=connector_feed_schedule.feed_id ORDER BY due_at LIMIT 1),9007199254740991)
WHERE feed_id IN(json_extract(NEW.request,'$.scope.feedId'),json_extract(OLD.request,'$.scope.feedId')); END;
CREATE TRIGGER connector_telegram_delete AFTER DELETE ON connector_provider_poll_jobs
WHEN OLD.state='PENDING' AND json_extract(OLD.request,'$.source.family')='telegram'
BEGIN UPDATE connector_feed_schedule SET telegram_due_ms=COALESCE((SELECT CAST((julianday(due_at)-2440587.5)*86400000 AS INTEGER)
FROM connector_provider_poll_jobs WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram'
AND json_extract(request,'$.scope.feedId')=connector_feed_schedule.feed_id ORDER BY due_at LIMIT 1),9007199254740991)
WHERE feed_id=json_extract(OLD.request,'$.scope.feedId'); END;
-- One-time backfill, not a recurring source-population scan.
UPDATE connector_feed_schedule SET telegram_due_ms=COALESCE((SELECT CAST((julianday(due_at)-2440587.5)*86400000 AS INTEGER)
FROM connector_provider_poll_jobs WHERE state='PENDING' AND json_extract(request,'$.source.family')='telegram'
AND json_extract(request,'$.scope.feedId')=connector_feed_schedule.feed_id ORDER BY due_at LIMIT 1),9007199254740991);
