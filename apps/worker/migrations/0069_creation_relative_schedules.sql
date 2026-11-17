-- Opt-in only: existing feeds remain NULL and keep their original schedules.
ALTER TABLE briefings ADD COLUMN briefing_schedule_origin_at TEXT;
