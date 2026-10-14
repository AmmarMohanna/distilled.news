-- Feed-scoped canonical reads must not scan every source across the deployment.
-- Keeps the existing intelligence interface and semantics unchanged.
CREATE INDEX connector_intake_feed ON v1_intake_scopes(feed_id,id);
