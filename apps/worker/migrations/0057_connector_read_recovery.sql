CREATE TABLE connector_provider_read_recoveries (
 feed_id TEXT NOT NULL,feed_source_id TEXT NOT NULL,source_id TEXT NOT NULL,
 run_id TEXT NOT NULL,provider_id TEXT NOT NULL,operation_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING',token TEXT NOT NULL,lease_until INTEGER NOT NULL,
 checked_at TEXT,payload_ref TEXT,PRIMARY KEY(feed_id,feed_source_id,run_id,operation_id)
);
