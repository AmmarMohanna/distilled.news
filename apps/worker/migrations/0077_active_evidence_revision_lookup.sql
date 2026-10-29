-- Hydrate only selected current revisions without scanning full active evidence payloads.
CREATE INDEX IF NOT EXISTS v1_evidence_active_revision_lookup
ON v1_evidence(feed_source_id,json_extract(json,'$.currentRevisionId'))
WHERE json_extract(json,'$.state')='ACTIVE';
