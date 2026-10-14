-- Preserve prior charges when upgrading to independent source/provider caps.
-- Legacy source attribution is reconstructed from scoped immutable payload paths.
ALTER TABLE connector_provider_operations ADD COLUMN feed_id TEXT;
ALTER TABLE connector_provider_operations ADD COLUMN feed_source_id TEXT;
CREATE INDEX connector_operations_payload ON connector_provider_operations(provider_id,payload_ref);
CREATE INDEX connector_operations_unattributed ON connector_provider_operations(provider_id,feed_source_id,payload_ref);
CREATE INDEX connector_delivery_expiry ON connector_queue_dispatch(available_ms);
CREATE INDEX connector_recovery_expiry ON connector_queue_recovery(observed_at);
