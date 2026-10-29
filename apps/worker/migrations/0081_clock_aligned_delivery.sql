-- Opt-in only for newly created feeds. Existing schedules and jobs retain their identities.
ALTER TABLE briefings ADD COLUMN briefing_schedule_clock_start_at TEXT;
CREATE INDEX v1_clock_schedule_requests ON v1_feed_documents(
 feed_id,json_extract(json,'$.window.clockStartAt'),json_extract(json,'$.window.durationMinutes'),json_extract(json,'$.window.end') DESC
) WHERE kind='briefing_requests';
