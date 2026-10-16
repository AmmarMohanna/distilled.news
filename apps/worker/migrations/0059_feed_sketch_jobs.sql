-- Durable one-time feed illustration creation. The stored image is never invalidated.
CREATE TABLE feed_sketch_jobs (
  feed_id TEXT PRIMARY KEY REFERENCES briefings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  interest_profile TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','running','ready')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  dispatch_until TEXT NOT NULL,
  lease_token TEXT,
  lease_until TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_feed_sketch_jobs_due ON feed_sketch_jobs(state,next_attempt_at,dispatch_until);
