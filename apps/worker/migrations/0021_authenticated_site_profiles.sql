CREATE TABLE credential_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  site_family TEXT NOT NULL,
  authentication_method TEXT NOT NULL,
  encrypted_credential_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX credential_profiles_tenant_owner ON credential_profiles(tenant_id,owner_id,site_family);

CREATE TABLE authenticated_site_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  site_family TEXT NOT NULL,
  allowed_origins_json TEXT NOT NULL,
  permission_scope TEXT NOT NULL CHECK(permission_scope='READ_ONLY'),
  authentication_method TEXT NOT NULL,
  credential_profile_id TEXT,
  encrypted_session_ref TEXT,
  session_state TEXT NOT NULL CHECK(session_state IN ('ACTIVE','SESSION_EXPIRED','REAUTH_REQUIRED','MFA_REQUIRED','CHALLENGE_REQUIRED','REVOKED')),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_validated_at TEXT,
  expires_at TEXT,
  reauth_reason TEXT,
  revoked_at TEXT,
  FOREIGN KEY(credential_profile_id) REFERENCES credential_profiles(id)
);
CREATE UNIQUE INDEX authenticated_site_profiles_owner_site ON authenticated_site_profiles(tenant_id,owner_id,site_family);

CREATE TABLE authenticated_profile_audit (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  safe_metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES authenticated_site_profiles(id)
);
CREATE INDEX authenticated_profile_audit_profile ON authenticated_profile_audit(tenant_id,profile_id,created_at);
