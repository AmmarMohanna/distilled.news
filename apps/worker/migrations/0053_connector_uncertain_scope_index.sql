-- Indexed financial fence: a new polling window or provider fallback must not
-- bypass an unresolved paid submission for the same independently scoped source.
CREATE INDEX connector_operations_pending_scope ON connector_provider_operations(feed_id,feed_source_id) WHERE payload_ref IS NULL;
