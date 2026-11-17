-- Derived indexes only. Canonical evidence and observations remain immutable.
-- Existing rows are backfilled in bounded keyset batches, not one large migration scan.
CREATE TABLE IF NOT EXISTS v1_revision_selection_index(id TEXT PRIMARY KEY,feed_source_id TEXT NOT NULL,evidence_id TEXT,published_at TEXT,accepted_at TEXT,source_observation_id TEXT);
CREATE TABLE IF NOT EXISTS v1_observation_time_index(id TEXT PRIMARY KEY,feed_source_id TEXT NOT NULL,observed_at TEXT);
CREATE TRIGGER IF NOT EXISTS v1_revision_selection_insert AFTER INSERT ON v1_revisions BEGIN
 INSERT OR IGNORE INTO v1_revision_selection_index VALUES(NEW.id,NEW.feed_source_id,json_extract(NEW.json,'$.evidenceId'),json_extract(NEW.json,'$.publishedAt'),json_extract(NEW.json,'$.acceptedAt'),json_extract(NEW.json,'$.sourceObservationId'));
END;
CREATE TRIGGER IF NOT EXISTS v1_observation_time_insert AFTER INSERT ON v1_inputs BEGIN
 INSERT OR IGNORE INTO v1_observation_time_index VALUES(NEW.id,NEW.feed_source_id,json_extract(NEW.json,'$.observation.observedAt'));
END;
