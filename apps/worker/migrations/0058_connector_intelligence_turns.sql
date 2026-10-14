-- Connector-owned admission only. Canonical jobs, model journals and CAS stay
-- in the intelligence runtime; lease expiry makes a crashed turn recoverable.
CREATE TABLE connector_intelligence_turns (
 feed_id TEXT PRIMARY KEY REFERENCES briefings(id) ON DELETE CASCADE,
 token TEXT NOT NULL,
 lease_until INTEGER NOT NULL
);
