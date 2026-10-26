-- Private, regenerable catch-up text; separate from immutable publication evidence.
CREATE TABLE unread_summary_cache (
 kind TEXT NOT NULL, id TEXT NOT NULL, feed_id TEXT NOT NULL,
 json TEXT NOT NULL CHECK(json_valid(json)), PRIMARY KEY(kind,id)
);
CREATE INDEX unread_summary_cache_feed ON unread_summary_cache(feed_id,kind);
