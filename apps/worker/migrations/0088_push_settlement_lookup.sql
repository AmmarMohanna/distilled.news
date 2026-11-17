-- Settlement only examines published editions newer than a current subscriber's cutoff.
CREATE INDEX IF NOT EXISTS v1_push_publication_time ON v1_feed_documents(
  feed_id, json_extract(json,'$.publishedAt'), id
) WHERE kind='publication_status' AND json_extract(json,'$.status')='PUBLISHED';

CREATE INDEX IF NOT EXISTS v1_push_edition_receipts ON v1_feed_documents(
  feed_id, json_extract(json,'$.editionId'), json_extract(json,'$.subscriptionVersion'), json_extract(json,'$.state')
) WHERE kind='browser_push_receipts';
