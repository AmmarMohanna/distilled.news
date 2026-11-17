-- Transport backpressure only. Canonical leases and financial identities remain authoritative.
CREATE TABLE connector_work_slots (
 feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
 lane TEXT NOT NULL, slot INTEGER NOT NULL,
 token TEXT NOT NULL, lease_until INTEGER NOT NULL,
 PRIMARY KEY(feed_id,lane,slot)
);
CREATE INDEX connector_work_slots_expiry ON connector_work_slots(lease_until);
CREATE INDEX connector_work_slots_token ON connector_work_slots(token);
