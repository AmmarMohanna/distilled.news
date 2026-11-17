-- Keep feed-scoped ordered reads from scanning every document of the same kind.
-- Existing feed_id/kind and primary-key indexes do not cover this ORDER BY together.
CREATE INDEX IF NOT EXISTS v1_feed_documents_scope_order ON v1_feed_documents(feed_id,kind,id);
