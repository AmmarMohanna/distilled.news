-- Cutoff snapshots must not resurrect an article across a retained deletion.
CREATE INDEX IF NOT EXISTS v1_tombstone_evidence_time ON v1_tombstones(
 feed_source_id,json_extract(json,'$.evidenceId'),julianday(json_extract(json,'$.acceptedAt'))
);
