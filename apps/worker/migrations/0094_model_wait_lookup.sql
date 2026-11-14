-- Keep paused-window recovery off completed history.
CREATE INDEX v1_briefing_pending_v3_close ON v1_feed_documents(
  json_extract(json,'$.window.end'),feed_id,id
) WHERE kind='briefing_requests' AND json_extract(json,'$.state')='PENDING'
 AND json_extract(json,'$.engine')='v3';

-- Fence a callback that loaded the request before paused-window retirement.
CREATE TRIGGER v1_paused_window_retirement_epoch
AFTER UPDATE OF json ON v1_feed_documents
WHEN OLD.kind='briefing_requests' AND json_extract(OLD.json,'$.state')='PENDING'
 AND json_extract(NEW.json,'$.state')='DONE'
 AND json_extract(NEW.json,'$.reason')='FEED_PAUSED_WINDOW_RETIRED'
BEGIN
  UPDATE v1_feeds SET epoch=epoch+1 WHERE id=NEW.feed_id;
END;
