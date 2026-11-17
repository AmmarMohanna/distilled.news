-- Connector-owned suppression of unchanged item observations. Update only after
-- durable resolved intake receipts; feed revision changes require revalidation.
CREATE TABLE connector_item_fingerprints (
  feed_id TEXT NOT NULL,
  feed_source_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_item_key TEXT NOT NULL,
  configuration_revision INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  fetch_sequence INTEGER NOT NULL,
  PRIMARY KEY(feed_id,feed_source_id,source_item_key)
);
