-- Optional exact-request workflow bounds. Historical scopes retain their $0.125 cap.
DROP TRIGGER IF EXISTS v1_model_spending_evaluation_scope;
CREATE TRIGGER v1_model_spending_evaluation_scope BEFORE INSERT ON v1_model_spending_reservations
WHEN json_type((SELECT json FROM v1_model_spending_authorizations WHERE id=NEW.authorization_id),'$.evaluationScope') IS NOT NULL
BEGIN
 SELECT CASE WHEN EXISTS(
 SELECT 1 FROM v1_model_spending_authorizations a WHERE a.id=NEW.authorization_id AND a.account_id=NEW.account_id
 AND NEW.feed_id=json_extract(a.json,'$.evaluationScope.feedId')
 AND NEW.created_at>=a.valid_from AND NEW.created_at<a.valid_until
 AND julianday('now')>=julianday(a.valid_from) AND julianday('now')<julianday(a.valid_until)
 AND NEW.reserved_cost_usd>=0 AND NEW.reserved_cost_usd<=COALESCE(json_extract(a.json,'$.evaluationScope.maxPerOperationUsd'),0.125)
 AND (json_type(a.json,'$.evaluationScope.maxPerOperationUsd') IS NULL OR (json_type(a.json,'$.evaluationScope.maxPerOperationUsd') IN ('integer','real') AND json_extract(a.json,'$.evaluationScope.maxPerOperationUsd')>0 AND json_extract(a.json,'$.evaluationScope.maxPerOperationUsd')<=0.35))
 AND (COALESCE(json_extract(a.json,'$.evaluationScope.maxPerOperationUsd'),0.125)<=0.125 OR json_type(a.json,'$.evaluationScope.workflow')='object')
 AND (json_type(a.json,'$.evaluationScope.workflow') IS NULL OR (
 json_type(a.json,'$.evaluationScope.workflow')='object'
 AND json_extract(a.json,'$.evaluationScope.workflow.id')=json_extract(a.json,'$.evaluationScope.manifestHash')
 AND json_type(a.json,'$.evaluationScope.workflow.maxNewOperations')='integer'
 AND json_extract(a.json,'$.evaluationScope.workflow.maxNewOperations') BETWEEN 1 AND 24
 AND json_type(a.json,'$.evaluationScope.workflow.maxNewSpendingUsd') IN ('integer','real')
 AND json_extract(a.json,'$.evaluationScope.workflow.maxNewSpendingUsd')>0 AND json_extract(a.json,'$.evaluationScope.workflow.maxNewSpendingUsd')<=3
 AND NOT EXISTS(SELECT 1 FROM v1_model_spending_authorizations old WHERE old.account_id=a.account_id AND json_extract(old.json,'$.evaluationScope.feedId')=NEW.feed_id AND json_type(old.json,'$.evaluationScope.workflow') IS NOT NULL AND (json_extract(old.json,'$.evaluationScope.workflow.id')<>json_extract(a.json,'$.evaluationScope.workflow.id') OR json_extract(old.json,'$.evaluationScope.workflow.maxNewOperations')<>json_extract(a.json,'$.evaluationScope.workflow.maxNewOperations') OR json_extract(old.json,'$.evaluationScope.workflow.maxNewSpendingUsd')<>json_extract(a.json,'$.evaluationScope.workflow.maxNewSpendingUsd')))
 AND (SELECT COUNT(*) FROM v1_model_spending_reservations r WHERE r.account_id=NEW.account_id AND r.feed_id=NEW.feed_id)<json_extract(a.json,'$.evaluationScope.workflow.maxNewOperations')
 AND (SELECT COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=NEW.account_id AND r.feed_id=NEW.feed_id)+NEW.reserved_cost_usd<=json_extract(a.json,'$.evaluationScope.workflow.maxNewSpendingUsd')
 ))
 AND json_extract(NEW.json,'$.evaluation.manifestHash')=json_extract(a.json,'$.evaluationScope.manifestHash')
 AND EXISTS(SELECT 1 FROM json_each(a.json,'$.evaluationScope.operations') o WHERE json_extract(o.value,'$.id')=NEW.id AND json_extract(o.value,'$.model')=NEW.model AND json_extract(o.value,'$.requestHash')=json_extract(NEW.json,'$.evaluation.requestHash'))
 AND (SELECT COUNT(*) FROM v1_model_spending_reservations r WHERE r.authorization_id=a.id)<json_extract(a.json,'$.evaluationScope.maxNewOperations')
 AND (SELECT COUNT(*) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=a.id AND COALESCE(s.reported,0)=0)<json_extract(a.json,'$.evaluationScope.maxConcurrentOperations')
 AND (SELECT COALESCE(SUM(MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0))),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.authorization_id=a.id)+NEW.reserved_cost_usd<=json_extract(a.json,'$.evaluationScope.maxNewSpendingUsd')
 AND (SELECT COALESCE(SUM(CASE WHEN s.reported=1 THEN s.cost_usd ELSE MAX(r.reserved_cost_usd,COALESCE(s.cost_usd,0)) END),0) FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.account_id=NEW.account_id)+NEW.reserved_cost_usd<=json_extract(a.json,'$.evaluationScope.maxLifetimeExposureUsd')
 ) THEN 1 ELSE RAISE(ABORT,'v1_model_spending_admission') END;
END;
