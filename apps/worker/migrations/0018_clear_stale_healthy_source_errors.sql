UPDATE sources
SET failure_class = NULL,
    consecutive_failures = 0,
    last_error = NULL,
    next_retry_at = NULL
WHERE enabled = 1
  AND health_state = 'healthy';
