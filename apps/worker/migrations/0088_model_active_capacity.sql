-- Execution occupancy is a projection, never a replacement for financial history.
CREATE TABLE v1_model_active_operations (
 id TEXT PRIMARY KEY REFERENCES v1_model_spending_reservations(id),
 provider TEXT NOT NULL CHECK(provider IN ('openrouter','cloudflare')),
 account_id TEXT NOT NULL, feed_id TEXT NOT NULL, token TEXT NOT NULL,
 lease_until INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX v1_model_active_provider_feed ON v1_model_active_operations(provider,feed_id,created_at);
CREATE INDEX v1_model_active_expiry ON v1_model_active_operations(lease_until,id);
CREATE INDEX v1_model_reservation_rate_window ON v1_model_spending_reservations(
 CASE WHEN model LIKE 'cloudflare:%' OR model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END,created_at
);
INSERT INTO v1_model_active_operations
SELECT r.id,CASE WHEN r.model LIKE 'cloudflare:%' OR r.model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END,
 r.account_id,r.feed_id,r.token,r.lease_until,r.created_at
FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id
WHERE COALESCE(s.reported,0)=0 AND NOT EXISTS (
 SELECT 1 FROM v1_feed_documents q WHERE q.kind='model_execution_quarantines' AND q.id=r.id AND q.feed_id=r.feed_id
 AND json_extract(q.json,'$.accountId')=r.account_id AND json_extract(q.json,'$.reservationToken')=r.token
);
CREATE TRIGGER v1_model_active_reservation AFTER INSERT ON v1_model_spending_reservations
BEGIN
 INSERT INTO v1_model_active_operations VALUES(NEW.id,CASE WHEN NEW.model LIKE 'cloudflare:%' OR NEW.model LIKE 'workers_ai:%' THEN 'cloudflare' ELSE 'openrouter' END,NEW.account_id,NEW.feed_id,NEW.token,NEW.lease_until,NEW.created_at);
END;
CREATE TRIGGER v1_model_active_settled_insert AFTER INSERT ON v1_model_spending_settlements WHEN NEW.reported=1
BEGIN DELETE FROM v1_model_active_operations WHERE id=NEW.id AND token=NEW.token; END;
CREATE TRIGGER v1_model_active_settled_update AFTER UPDATE ON v1_model_spending_settlements WHEN NEW.reported=1
BEGIN DELETE FROM v1_model_active_operations WHERE id=NEW.id AND token=NEW.token; END;
CREATE TRIGGER v1_model_active_quarantined AFTER INSERT ON v1_feed_documents WHEN NEW.kind='model_execution_quarantines'
BEGIN
 DELETE FROM v1_model_active_operations WHERE id=NEW.id AND feed_id=NEW.feed_id
 AND account_id=json_extract(NEW.json,'$.accountId') AND token=json_extract(NEW.json,'$.reservationToken');
END;
