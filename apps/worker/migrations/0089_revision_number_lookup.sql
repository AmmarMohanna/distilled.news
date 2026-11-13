-- Promotion needs the next item revision number, including history retained
-- after deletion. Do not read all source article bodies or depend on item_key,
-- which older immutable revision rows may omit.
CREATE INDEX IF NOT EXISTS v1_revision_number_lookup ON v1_revisions(
  feed_source_id,json_extract(json,'$.evidenceId'),json_extract(json,'$.revision') DESC
);
