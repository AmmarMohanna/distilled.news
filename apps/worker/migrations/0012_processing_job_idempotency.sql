DELETE FROM processing_jobs
WHERE rowid IN (
  SELECT rowid
  FROM (
    SELECT
      rowid,
      ROW_NUMBER() OVER (
        PARTITION BY raw_message_id
        ORDER BY
          CASE state WHEN 'completed' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
          updated_at DESC,
          created_at DESC
      ) AS duplicate_rank
    FROM processing_jobs
  )
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processing_jobs_raw_message
  ON processing_jobs(raw_message_id);
