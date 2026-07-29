ALTER TABLE briefing_windows ADD COLUMN recovery_attempted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_briefing_windows_recovery
  ON briefing_windows (briefing_id, cadence, state, recovery_attempted_at, window_end);
