PRAGMA foreign_keys = ON;

-- Before running this file, list and remove the cohort raw_payload_key objects
-- from R2 as described in docs/SYNTHETIC-CANARY.md.
DELETE FROM accounts WHERE id LIKE 'account_canary_%';

SELECT
  (SELECT COUNT(*) FROM accounts WHERE id LIKE 'account_canary_%') AS accounts,
  (SELECT COUNT(*) FROM briefings WHERE id LIKE 'briefing_canary_%') AS briefings,
  (SELECT COUNT(*) FROM sources WHERE id LIKE 'source_canary_%') AS sources,
  (SELECT COUNT(*) FROM raw_messages WHERE briefing_id LIKE 'briefing_canary_%') AS raw_messages;

