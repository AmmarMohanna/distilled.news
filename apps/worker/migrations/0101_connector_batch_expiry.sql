CREATE TABLE connector_batch_expiry (
  kind TEXT NOT NULL CHECK(kind IN ('rss','provider')),
  feed_id TEXT NOT NULL,
  feed_source_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  archive_ref TEXT,
  PRIMARY KEY(kind,feed_id,feed_source_id,batch_id)
);
CREATE INDEX connector_batch_expiry_due ON connector_batch_expiry(expires_at);

-- Only the final batch of a successful poll gets an expiry. Earlier pages,
-- blocked jobs and diagnostic runs may still be needed for recovery.
CREATE TRIGGER connector_rss_batch_expiry AFTER UPDATE OF state ON connector_rss_poll_jobs
WHEN OLD.state='PENDING' AND NEW.state='DONE' AND json_type(NEW.result,'$.handoffId')='text'
BEGIN
  INSERT INTO connector_batch_expiry(kind,feed_id,feed_source_id,batch_id,expires_at)
  SELECT 'rss',feed_id,feed_source_id,handoff_id,unixepoch()+604800 FROM connector_batches
  WHERE feed_id=json_extract(NEW.request,'$.scope.feedId') AND feed_source_id=json_extract(NEW.request,'$.scope.feedSourceId')
    AND handoff_id=json_extract(NEW.result,'$.handoffId') AND receipts IS NOT NULL
  ON CONFLICT DO NOTHING;
END;

CREATE TRIGGER connector_provider_batch_expiry AFTER UPDATE OF state ON connector_provider_poll_jobs
WHEN OLD.state='PENDING' AND NEW.state='DONE' AND json_type(NEW.result,'$.request.handoffId')='text'
BEGIN
  INSERT INTO connector_batch_expiry(kind,feed_id,feed_source_id,batch_id,expires_at)
  SELECT 'provider',feed_id,feed_source_id,batch_key,unixepoch()+604800 FROM connector_provider_batches
  WHERE feed_id=json_extract(NEW.request,'$.scope.feedId') AND feed_source_id=json_extract(NEW.request,'$.scope.feedSourceId')
    AND batch_key=json_extract(NEW.result,'$.request.handoffId') AND receipts IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
