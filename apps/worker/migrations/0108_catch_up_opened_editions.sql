CREATE TABLE catch_up_opened_editions (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  feed_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  edition_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (account_id,feed_id,edition_id)
);

CREATE INDEX catch_up_opened_expiry ON catch_up_opened_editions(expires_at);
CREATE INDEX catch_up_opened_feed ON catch_up_opened_editions(feed_id);
