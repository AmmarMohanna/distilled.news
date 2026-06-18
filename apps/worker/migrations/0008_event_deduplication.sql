ALTER TABLE briefing_items ADD COLUMN event_key TEXT;

CREATE TABLE IF NOT EXISTS briefing_item_event_keys (
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  briefing_item_id TEXT NOT NULL REFERENCES briefing_items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (briefing_id, event_key)
);

UPDATE OR IGNORE briefing_item_evidence
SET briefing_item_id = (
  SELECT survivor.briefing_item_id
  FROM briefing_item_evidence AS survivor
  JOIN briefing_items AS survivor_item ON survivor_item.id = survivor.briefing_item_id
  WHERE survivor.raw_message_id = briefing_item_evidence.raw_message_id
  ORDER BY survivor_item.item_at DESC, survivor_item.id ASC
  LIMIT 1
)
WHERE raw_message_id IN (
  SELECT raw_message_id
  FROM briefing_item_evidence
  GROUP BY raw_message_id
  HAVING COUNT(*) > 1
);

DELETE FROM briefing_item_evidence
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      briefing_item_evidence.id,
      ROW_NUMBER() OVER (
        PARTITION BY briefing_item_evidence.raw_message_id
        ORDER BY briefing_items.item_at DESC, briefing_items.id ASC
      ) AS row_number
    FROM briefing_item_evidence
    JOIN briefing_items ON briefing_items.id = briefing_item_evidence.briefing_item_id
  )
  WHERE row_number > 1
);

DELETE FROM briefing_items
WHERE id NOT IN (SELECT DISTINCT briefing_item_id FROM briefing_item_evidence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_briefing_item_evidence_raw_message
  ON briefing_item_evidence(raw_message_id);

CREATE INDEX IF NOT EXISTS idx_briefing_items_event_key
  ON briefing_items(briefing_id, event_key);
