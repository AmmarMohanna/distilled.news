-- V5 editorial audit records stay immutable. Only the current review pointer advances.
DROP TRIGGER v1_feed_document_immutable;
CREATE TRIGGER v1_feed_document_immutable BEFORE UPDATE ON v1_feed_documents
WHEN OLD.kind NOT IN ('events','storylines','publication_status','delivery_jobs','synthesis_jobs',
 'briefing_requests','manual_briefing_requests','v5_review_states') AND NEW.json!=OLD.json
BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
