-- New feeds opt in explicitly. Do not reinterpret retained feeds or queued windows.
ALTER TABLE briefings ADD COLUMN briefing_schedule_policy TEXT
 CHECK (briefing_schedule_policy IS NULL OR
  (briefing_schedule_policy = 'clock-aligned-delivery-v2' AND briefing_schedule_clock_start_at IS NOT NULL));
