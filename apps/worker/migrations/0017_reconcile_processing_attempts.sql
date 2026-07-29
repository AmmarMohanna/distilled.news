UPDATE processing_attempts
SET state = 'completed', completed_at = COALESCE(completed_at, (
  SELECT COALESCE(processing_jobs.completed_at, processing_jobs.updated_at)
  FROM processing_jobs
  WHERE processing_jobs.id = processing_attempts.job_id
))
WHERE state = 'running'
  AND EXISTS (
    SELECT 1 FROM processing_jobs
    WHERE processing_jobs.id = processing_attempts.job_id
      AND processing_jobs.state = 'completed'
  );

UPDATE processing_attempts
SET state = 'failed', completed_at = COALESCE(completed_at, (
  SELECT processing_jobs.updated_at
  FROM processing_jobs
  WHERE processing_jobs.id = processing_attempts.job_id
)), error = COALESCE(error, 'Processing job failed.')
WHERE state = 'running'
  AND EXISTS (
    SELECT 1 FROM processing_jobs
    WHERE processing_jobs.id = processing_attempts.job_id
      AND processing_jobs.state = 'failed'
  );
