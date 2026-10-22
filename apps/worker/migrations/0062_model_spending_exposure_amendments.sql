-- Explicit operator exposure top-ups retain the original grant and accounting period.
CREATE TABLE v1_model_spending_exposure_amendments (
 id TEXT PRIMARY KEY CHECK(length(trim(id))>0),
 authorization_id TEXT NOT NULL REFERENCES v1_model_spending_authorizations(id),
 account_id TEXT NOT NULL CHECK(length(trim(account_id))>0),
 sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>0),
 previous_max_exposure_usd REAL NOT NULL CHECK(previous_max_exposure_usd>0 AND previous_max_exposure_usd<=1.7976931348623157e308),
 max_exposure_usd REAL NOT NULL CHECK(max_exposure_usd>previous_max_exposure_usd AND max_exposure_usd<=1.7976931348623157e308),
 created_at TEXT NOT NULL,
 json TEXT NOT NULL CHECK(json_valid(json)) CHECK(COALESCE(
  json_type(json,'$.id')='text' AND json_extract(json,'$.id')=id AND
  json_type(json,'$.authorizationId')='text' AND json_extract(json,'$.authorizationId')=authorization_id AND
  json_type(json,'$.accountId')='text' AND json_extract(json,'$.accountId')=account_id AND
  json_type(json,'$.sequence')='integer' AND json_extract(json,'$.sequence')=sequence AND
  json_type(json,'$.previousMaxExposureUsd') IN ('integer','real') AND json_extract(json,'$.previousMaxExposureUsd')=previous_max_exposure_usd AND
  json_type(json,'$.maxExposureUsd') IN ('integer','real') AND json_extract(json,'$.maxExposureUsd')=max_exposure_usd AND
  json_type(json,'$.approvedBy')='text' AND length(trim(json_extract(json,'$.approvedBy')))>0 AND
  json_type(json,'$.approvalId')='text' AND length(trim(json_extract(json,'$.approvalId')))>0 AND
  json_type(json,'$.createdAt')='text' AND json_extract(json,'$.createdAt')=created_at AND
  strftime('%Y-%m-%dT%H:%M:%fZ',created_at)=created_at,0)=1),
 UNIQUE(authorization_id,sequence)
);
CREATE TRIGGER v1_model_exposure_amendment_parent BEFORE INSERT ON v1_model_spending_exposure_amendments
WHEN EXISTS(SELECT 1 FROM v1_model_spending_exposure_amendments WHERE id=NEW.id)
 OR NOT EXISTS(SELECT 1 FROM v1_model_spending_authorizations a
 WHERE a.id=NEW.authorization_id AND a.account_id=NEW.account_id
 AND json_extract(a.json,'$.id')=a.id AND json_extract(a.json,'$.accountId')=a.account_id
 AND julianday(NEW.created_at)>=julianday(a.valid_from) AND julianday(NEW.created_at)<julianday(a.valid_until)
 AND julianday(NEW.created_at)<=julianday('now')
 AND NEW.sequence=COALESCE((SELECT MAX(sequence) FROM v1_model_spending_exposure_amendments WHERE authorization_id=a.id),0)+1
 AND NEW.previous_max_exposure_usd=COALESCE((SELECT max_exposure_usd FROM v1_model_spending_exposure_amendments WHERE authorization_id=a.id ORDER BY sequence DESC LIMIT 1),json_extract(a.json,'$.maxExposureUsd')))
BEGIN SELECT RAISE(ABORT,'MODEL_EXPOSURE_AMENDMENT_PARENT'); END;
CREATE TRIGGER v1_model_exposure_amendment_no_update BEFORE UPDATE ON v1_model_spending_exposure_amendments BEGIN SELECT RAISE(ABORT,'MODEL_EXPOSURE_AMENDMENT_IMMUTABLE'); END;
CREATE TRIGGER v1_model_exposure_amendment_no_delete BEFORE DELETE ON v1_model_spending_exposure_amendments BEGIN SELECT RAISE(ABORT,'MODEL_EXPOSURE_AMENDMENT_IMMUTABLE'); END;
-- The older schema fenced UPDATE only. Also prevent deletion and replacement of the accounting authority.
CREATE TRIGGER v1_model_spending_authority_no_delete BEFORE DELETE ON v1_model_spending_authorizations BEGIN SELECT RAISE(ABORT,'MODEL_AUTHORITY_IMMUTABLE'); END;
CREATE TRIGGER v1_model_spending_authority_no_replace BEFORE INSERT ON v1_model_spending_authorizations WHEN EXISTS(SELECT 1 FROM v1_model_spending_authorizations WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'MODEL_AUTHORITY_IMMUTABLE'); END;
