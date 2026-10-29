-- Release immutable renewal chains by feed and owner without scanning retained lease JSON.
CREATE INDEX IF NOT EXISTS v1_semantic_lease_owner
ON v1_feed_documents(feed_id,json_extract(json,'$.token'),id)
WHERE kind='semantic_work_leases';
