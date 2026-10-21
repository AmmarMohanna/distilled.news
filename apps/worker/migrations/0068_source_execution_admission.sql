-- Capacity leases only. Expiry recovers crashed executions; no provider call,
-- evidence revision, paid operation or canonical job is changed by this table.
CREATE TABLE IF NOT EXISTS source_execution_slots (
 slot INTEGER PRIMARY KEY CHECK(slot IN (0,1)),
 token TEXT NOT NULL,
 lease_until INTEGER NOT NULL
);
