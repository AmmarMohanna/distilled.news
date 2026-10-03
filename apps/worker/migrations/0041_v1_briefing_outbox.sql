DROP TRIGGER v1_feed_document_immutable;
CREATE TRIGGER v1_feed_document_immutable BEFORE UPDATE ON v1_feed_documents WHEN OLD.kind NOT IN ('events','storylines','publication_status','delivery_jobs','synthesis_jobs','briefing_requests') AND NEW.json!=OLD.json BEGIN SELECT RAISE(ABORT,'V1_IMMUTABLE'); END;
