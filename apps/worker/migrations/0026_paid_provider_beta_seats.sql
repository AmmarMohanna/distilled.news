CREATE TABLE IF NOT EXISTS paid_provider_seats (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_paid_provider_seats_claimed
  ON paid_provider_seats(claimed_at, account_id);

INSERT OR IGNORE INTO paid_provider_seats (account_id, claimed_at)
SELECT briefings.owner_account_id, MIN(sources.created_at)
FROM sources
JOIN briefings ON briefings.id = sources.briefing_id
WHERE sources.kind IN ('google_news', 'x_profile', 'x_search')
GROUP BY briefings.owner_account_id;

CREATE TRIGGER IF NOT EXISTS paid_provider_seat_cap_before_source_insert
BEFORE INSERT ON sources
WHEN NEW.kind IN ('google_news', 'x_profile', 'x_search')
  AND CAST(COALESCE((
    SELECT value FROM settings WHERE key = 'hosted_paid_provider_account_cap'
  ), '0') AS INTEGER) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM paid_provider_seats
    WHERE account_id = (
      SELECT owner_account_id FROM briefings WHERE id = NEW.briefing_id
    )
  )
  AND (
    SELECT COUNT(*) FROM paid_provider_seats
  ) >= CAST((
    SELECT value FROM settings WHERE key = 'hosted_paid_provider_account_cap'
  ) AS INTEGER)
BEGIN
  SELECT RAISE(ABORT, 'paid provider beta capacity reached');
END;

CREATE TRIGGER IF NOT EXISTS paid_provider_seat_cap_before_source_update
BEFORE UPDATE OF kind, briefing_id ON sources
WHEN NEW.kind IN ('google_news', 'x_profile', 'x_search')
  AND CAST(COALESCE((
    SELECT value FROM settings WHERE key = 'hosted_paid_provider_account_cap'
  ), '0') AS INTEGER) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM paid_provider_seats
    WHERE account_id = (
      SELECT owner_account_id FROM briefings WHERE id = NEW.briefing_id
    )
  )
  AND (
    SELECT COUNT(*) FROM paid_provider_seats
  ) >= CAST((
    SELECT value FROM settings WHERE key = 'hosted_paid_provider_account_cap'
  ) AS INTEGER)
BEGIN
  SELECT RAISE(ABORT, 'paid provider beta capacity reached');
END;

CREATE TRIGGER IF NOT EXISTS paid_provider_seat_claim_after_source_insert
AFTER INSERT ON sources
WHEN NEW.kind IN ('google_news', 'x_profile', 'x_search')
BEGIN
  INSERT OR IGNORE INTO paid_provider_seats (account_id, claimed_at)
  SELECT owner_account_id, NEW.created_at
  FROM briefings
  WHERE id = NEW.briefing_id;
END;

CREATE TRIGGER IF NOT EXISTS paid_provider_seat_sync_after_source_update
AFTER UPDATE OF kind, briefing_id ON sources
BEGIN
  INSERT OR IGNORE INTO paid_provider_seats (account_id, claimed_at)
  SELECT owner_account_id, NEW.updated_at
  FROM briefings
  WHERE id = NEW.briefing_id
    AND NEW.kind IN ('google_news', 'x_profile', 'x_search');

  DELETE FROM paid_provider_seats
  WHERE NOT EXISTS (
    SELECT 1
    FROM sources
    JOIN briefings ON briefings.id = sources.briefing_id
    WHERE briefings.owner_account_id = paid_provider_seats.account_id
      AND sources.kind IN ('google_news', 'x_profile', 'x_search')
  );
END;

CREATE TRIGGER IF NOT EXISTS paid_provider_seat_release_after_source_delete
AFTER DELETE ON sources
WHEN OLD.kind IN ('google_news', 'x_profile', 'x_search')
BEGIN
  DELETE FROM paid_provider_seats
  WHERE NOT EXISTS (
    SELECT 1
    FROM sources
    JOIN briefings ON briefings.id = sources.briefing_id
    WHERE briefings.owner_account_id = paid_provider_seats.account_id
      AND sources.kind IN ('google_news', 'x_profile', 'x_search')
  );
END;
