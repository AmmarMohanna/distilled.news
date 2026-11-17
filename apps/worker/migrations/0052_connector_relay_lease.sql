-- Downstream relay has its own lease and transport. It must not occupy a
-- source collection worker while validating the intelligence feed graph.
ALTER TABLE connector_feed_schedule ADD COLUMN relay_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE connector_feed_schedule ADD COLUMN relay_token TEXT;
