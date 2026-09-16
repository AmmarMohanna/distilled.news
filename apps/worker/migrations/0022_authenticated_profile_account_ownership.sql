CREATE TRIGGER credential_profiles_account_owner_insert
BEFORE INSERT ON credential_profiles
BEGIN
  SELECT CASE WHEN NEW.tenant_id != NEW.owner_id THEN RAISE(ABORT,'AUTH_TENANT_OWNER_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.owner_id AND disabled_at IS NULL) THEN RAISE(ABORT,'AUTH_OWNER_UNAVAILABLE') END;
END;

CREATE TRIGGER credential_profiles_account_owner_update
BEFORE UPDATE OF tenant_id,owner_id ON credential_profiles
BEGIN
  SELECT CASE WHEN NEW.tenant_id != NEW.owner_id THEN RAISE(ABORT,'AUTH_TENANT_OWNER_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.owner_id AND disabled_at IS NULL) THEN RAISE(ABORT,'AUTH_OWNER_UNAVAILABLE') END;
END;

CREATE TRIGGER authenticated_site_profiles_account_owner_insert
BEFORE INSERT ON authenticated_site_profiles
BEGIN
  SELECT CASE WHEN NEW.tenant_id != NEW.owner_id THEN RAISE(ABORT,'AUTH_TENANT_OWNER_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.owner_id AND disabled_at IS NULL) THEN RAISE(ABORT,'AUTH_OWNER_UNAVAILABLE') END;
END;

CREATE TRIGGER authenticated_site_profiles_account_owner_update
BEFORE UPDATE OF tenant_id,owner_id ON authenticated_site_profiles
BEGIN
  SELECT CASE WHEN NEW.tenant_id != NEW.owner_id THEN RAISE(ABORT,'AUTH_TENANT_OWNER_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE id=NEW.owner_id AND disabled_at IS NULL) THEN RAISE(ABORT,'AUTH_OWNER_UNAVAILABLE') END;
END;
