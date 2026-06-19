ALTER TABLE briefings ADD COLUMN briefing_cadence TEXT NOT NULL DEFAULT 'hourly';
ALTER TABLE briefings ADD COLUMN briefing_time_of_day TEXT NOT NULL DEFAULT '00:00';
ALTER TABLE briefings ADD COLUMN briefing_timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE briefings ADD COLUMN next_briefing_at TEXT;

CREATE TABLE IF NOT EXISTS briefing_editions (
  id TEXT PRIMARY KEY,
  briefing_id TEXT NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('hourly', 'daily', 'weekly', 'monthly')),
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'empty')),
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (briefing_id, cadence, window_start, window_end)
);

CREATE INDEX IF NOT EXISTS idx_briefing_editions_feed_time
  ON briefing_editions(briefing_id, published_at);

CREATE INDEX IF NOT EXISTS idx_briefing_editions_window
  ON briefing_editions(briefing_id, window_start, window_end);
