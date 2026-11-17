-- Recording a new boundary needs only the closest predecessor for this
-- schedule revision. Keep that lookup independent of total retained history.
CREATE INDEX IF NOT EXISTS v1_schedule_observation_predecessor ON v1_feed_documents(
  feed_id,json_extract(json,'$.feedRevision'),julianday(json_extract(json,'$.window.end')) DESC,id
) WHERE kind='schedule_observations';
