-- Store only encrypted, rotated OAuth refresh tokens. The encryption key is a Worker secret.
CREATE TABLE IF NOT EXISTS mail_oauth_tokens (
  provider TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
