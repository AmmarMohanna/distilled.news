-- Bounded operational cleanup must not scan the entire diagnostic history.
CREATE INDEX IF NOT EXISTS v1_queue_outcomes_retention ON v1_queue_outcomes(observed_at);
CREATE INDEX IF NOT EXISTS v1_semantic_lease_expiry
  ON v1_feed_documents(json_extract(json,'$.leaseUntil'),id)
  WHERE kind='semantic_work_leases';
