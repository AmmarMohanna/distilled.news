-- Point reads for each source's latest accepted collection batch. Source health,
-- the owner feed page and the AgentOps snapshot use them to report sources that
-- keep being checked without a successful poll.
CREATE INDEX IF NOT EXISTS connector_provider_batches_accepted
  ON connector_provider_batches(feed_id,feed_source_id,json_extract(data,'$.request.coverage.createdAt'))
  WHERE receipts IS NOT NULL;
CREATE INDEX IF NOT EXISTS connector_batches_accepted
  ON connector_batches(feed_id,feed_source_id,json_extract(data,'$.request.coverage.createdAt'))
  WHERE receipts IS NOT NULL;
