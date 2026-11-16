-- Explore reads publication timestamps without loading edition/source payloads.
CREATE INDEX IF NOT EXISTS v1_explore_publication_time
ON v1_feed_documents(feed_id, json_extract(json,'$.publishedAt') DESC)
WHERE kind='publication_status' AND json_extract(json,'$.status')='PUBLISHED';
CREATE INDEX IF NOT EXISTS briefing_explore_publication_time
ON briefing_editions(briefing_id, published_at DESC)
WHERE status='published';
