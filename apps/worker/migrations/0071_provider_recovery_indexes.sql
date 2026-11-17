-- Cover recurring recovery metadata reads without loading retained request/response JSON.
-- Partial indexes retain all rows and existing global reservation-identity backoff.
CREATE INDEX IF NOT EXISTS v1_provider_recovery_history
ON v1_feed_documents(kind,json_extract(json,'$.reservationId'),json_extract(json,'$.createdAt'),json_extract(json,'$.nextAttemptAt'))
WHERE kind='model_provider_recovery_attempts';
CREATE INDEX IF NOT EXISTS v1_provider_recovery_receipts
ON v1_feed_documents(kind,feed_id,json_extract(json,'$.reservationId'),json_extract(json,'$.provider'),json_extract(json,'$.generationId'))
WHERE kind='model_provider_receipts';
