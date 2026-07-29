ALTER TABLE briefing_windows ADD COLUMN content_cutoff_at TEXT;
ALTER TABLE briefing_windows ADD COLUMN quality_state TEXT NOT NULL DEFAULT 'ready'
  CHECK (quality_state IN ('ready', 'degraded'));
ALTER TABLE briefing_windows ADD COLUMN prepared_at TEXT;

CREATE INDEX IF NOT EXISTS idx_briefing_windows_cutoff
  ON briefing_windows(briefing_id, cadence, content_cutoff_at);

ALTER TABLE briefing_editions ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'deterministic'
  CHECK (generation_mode IN ('ai', 'deterministic'));
