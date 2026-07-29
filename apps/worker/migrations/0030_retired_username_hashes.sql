CREATE TABLE IF NOT EXISTS retired_username_hashes (
  username_hash TEXT PRIMARY KEY
    CHECK (
      length(username_hash) = 64
      AND username_hash NOT GLOB '*[^0-9a-f]*'
    ),
  retired_at TEXT NOT NULL
) WITHOUT ROWID;
