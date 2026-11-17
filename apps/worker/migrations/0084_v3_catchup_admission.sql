-- Mixed-version safety: a queued old runtime must not start a paid V3 call
-- after a newer scheduler deferred that untouched reporting window.
-- Model reservations and intent creation share an atomic D1 batch, so this
-- refusal rolls back the reservation before any provider request is sent.
CREATE TRIGGER IF NOT EXISTS v3_catchup_model_fence
BEFORE INSERT ON v1_feed_documents
WHEN NEW.kind='semantic_intents'
 AND json_extract(NEW.json,'$.input.kind')='V3_EDITOR_VERIFIER'
 AND substr(json_extract(NEW.json,'$.input.budgetKey'),1,3)='v3:'
 AND EXISTS(SELECT 1 FROM v1_feed_documents r
  WHERE r.kind='briefing_requests' AND r.feed_id=NEW.feed_id
   AND r.id=substr(json_extract(NEW.json,'$.input.budgetKey'),4)
   AND json_extract(r.json,'$.state')='DONE'
   AND json_extract(r.json,'$.reason')='SUPERSEDED_BY_LATER_WINDOW')
BEGIN
 SELECT RAISE(ABORT,'V3_WINDOW_SUPERSEDED');
END;

-- Relative schedules need only the latest recorded boundary, not every
-- historical request payload, including during bounded outage passes.
CREATE INDEX IF NOT EXISTS v1_relative_window_watermark
ON v1_feed_documents(feed_id,json_extract(json,'$.window.originAt'),json_extract(json,'$.window.durationMinutes'),json_extract(json,'$.window.end') DESC)
WHERE kind='briefing_requests';
