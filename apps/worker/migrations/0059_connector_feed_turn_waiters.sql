-- Durable FIFO admission for canonical feed work; no provider charge state.
CREATE TABLE connector_feed_turn_waiters (
 feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE, work_id TEXT NOT NULL, queued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, PRIMARY KEY(feed_id,work_id)
);
CREATE INDEX connector_feed_turn_waiters_order ON connector_feed_turn_waiters(feed_id,queued_at,work_id);
