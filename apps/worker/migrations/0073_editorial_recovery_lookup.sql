-- Match a frozen editorial window without parsing all retained intent payloads.
CREATE INDEX IF NOT EXISTS v1_editorial_recovery_window
ON v1_feed_documents(feed_id,json_extract(json,'$.input.budgetKey'),id)
WHERE kind='semantic_intents' AND json_extract(json,'$.input.kind')='COMPARATIVE_EDITORIAL_PLAN';
