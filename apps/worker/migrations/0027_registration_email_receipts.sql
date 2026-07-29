CREATE TABLE IF NOT EXISTS registration_email_receipts (
  nonce_hash TEXT PRIMARY KEY CHECK (length(nonce_hash) = 64),
  release_sha TEXT NOT NULL,
  recipient_fingerprint TEXT NOT NULL CHECK (length(recipient_fingerprint) = 64),
  expires_at TEXT NOT NULL,
  UNIQUE (release_sha, recipient_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_registration_email_receipts_expiry
  ON registration_email_receipts(expires_at);
