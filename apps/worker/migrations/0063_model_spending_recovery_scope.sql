-- Scoped recovery grants are fail-closed even for an older Worker or rollback.
-- Existing unscoped grants and immutable reservations are unchanged.
CREATE TRIGGER v1_model_spending_recovery_scope BEFORE INSERT ON v1_model_spending_reservations
WHEN json_type((SELECT json FROM v1_model_spending_authorizations WHERE id=NEW.authorization_id),'$.recoveryScope') IS NOT NULL
BEGIN
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM v1_model_spending_authorizations a WHERE a.id=NEW.authorization_id AND a.account_id=NEW.account_id
  AND json_type(a.json,'$.recoveryScope')='object'
  AND NEW.feed_id=json_extract(a.json,'$.recoveryScope.feedId')
  AND NEW.model IN (SELECT value FROM json_each(a.json,'$.modelIds'))
  AND substr(NEW.id,1,17)='semantic_intents:'
  AND NEW.created_at>=a.valid_from AND NEW.created_at<a.valid_until
  AND julianday('now')>=julianday(a.valid_from) AND julianday('now')<julianday(a.valid_until)
  AND json_extract(NEW.json,'$.recovery.stage') IN ('CONSTRUCTION','REPAIR')
  AND EXISTS(SELECT 1 FROM json_each(a.json,'$.recoveryScope.requests') p
    JOIN v1_feed_documents q ON q.kind='rematch_requests' AND q.id=json_extract(p.value,'$.requestId') AND q.feed_id=NEW.feed_id
    WHERE json_extract(p.value,'$.requestId')=json_extract(NEW.json,'$.recovery.requestId')
    AND json_extract(p.value,'$.evidenceRevisionId')=json_extract(NEW.json,'$.recovery.evidenceRevisionId')
    AND json_extract(q.json,'$.evidenceRevisionId')=json_extract(p.value,'$.evidenceRevisionId'))
  AND (SELECT COUNT(*) FROM v1_model_spending_reservations r WHERE r.authorization_id=a.id)<json_extract(a.json,'$.recoveryScope.maxNewOperations')
  AND (SELECT COUNT(*) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=a.id AND COALESCE(s.reported,0)=0)<json_extract(a.json,'$.recoveryScope.maxConcurrentOperations')
  AND (SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=a.id)+NEW.reserved_cost_usd<=json_extract(a.json,'$.recoveryScope.maxNewSpendingUsd')
  AND (SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=NEW.account_id)+NEW.reserved_cost_usd<=json_extract(a.json,'$.recoveryScope.maxLifetimeExposureUsd')
  AND NOT EXISTS(SELECT 1 FROM v1_model_spending_reservations r WHERE r.authorization_id=a.id AND json_extract(r.json,'$.recovery.requestId')=json_extract(NEW.json,'$.recovery.requestId') AND json_extract(r.json,'$.recovery.stage')=json_extract(NEW.json,'$.recovery.stage'))
  AND (json_extract(NEW.json,'$.recovery.stage')='CONSTRUCTION' OR EXISTS(
    SELECT 1 FROM v1_feed_documents i JOIN v1_feed_documents v ON v.kind='semantic_results' AND v.id=i.id AND v.feed_id=i.feed_id
    JOIN v1_model_spending_reservations r ON r.id='semantic_intents:'||i.id AND r.feed_id=i.feed_id
    JOIN v1_model_spending_settlements s ON s.id=r.id AND s.token=r.token AND s.reported=1
    WHERE i.kind='semantic_intents' AND i.id=json_extract(NEW.json,'$.recovery.rootOperationId') AND i.feed_id=NEW.feed_id
    AND json_extract(i.json,'$.input.kind')='SEMANTIC_CONSTRUCTION' AND r.model=NEW.model AND json_extract(i.json,'$.input.model')=NEW.model AND json_extract(i.json,'$.token')=r.token
    AND json_extract(i.json,'$.input.evidenceRevisionIds[0]')=json_extract(NEW.json,'$.recovery.evidenceRevisionId')
    AND json_extract(v.json,'$.failure')='SEMANTIC_CONSTRUCTION_REJECTED'
    AND json_extract(v.json,'$.usage.reported')=1 AND json_extract(v.json,'$.usage.calls')=1
  ))
 ) THEN 1 ELSE RAISE(ABORT,'v1_model_spending_admission') END;
END;
