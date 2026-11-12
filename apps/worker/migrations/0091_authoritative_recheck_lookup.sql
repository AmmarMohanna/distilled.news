-- Pending authoritative conflicts are visited in canonical job-ID order.
-- The general due index orders retry time before ID and sorts the entire
-- backlog before LIMIT; this covering partial index streams the same range.
CREATE INDEX IF NOT EXISTS v1_authoritative_recheck_order ON v1_jobs(feed_source_id,id,item_key)
WHERE json_extract(json,'$.kind')='AUTHORITATIVE_RECHECK' AND json_extract(json,'$.state')='PENDING';
