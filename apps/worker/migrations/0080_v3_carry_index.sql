-- Derived carry references only. Original results and paid identities remain untouched.
CREATE TABLE IF NOT EXISTS v3_carry_index_state(feed_id TEXT PRIMARY KEY REFERENCES v1_feeds(id) ON DELETE CASCADE,ready INTEGER NOT NULL CHECK(ready IN (0,1)),version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS v3_carry_decisions(feed_id TEXT NOT NULL REFERENCES v1_feeds(id) ON DELETE CASCADE,revision_id TEXT NOT NULL,result_id TEXT NOT NULL,window_end TEXT NOT NULL,carry INTEGER NOT NULL CHECK(carry IN (0,1)),PRIMARY KEY(feed_id,revision_id,result_id));
CREATE INDEX IF NOT EXISTS v3_carry_positive ON v3_carry_decisions(feed_id,revision_id) WHERE carry=1;
CREATE INDEX IF NOT EXISTS v3_carry_decisions_result ON v3_carry_decisions(result_id,feed_id);
CREATE VIEW IF NOT EXISTS v3_carry_touches AS
 SELECT d.feed_id,d.id AS result_id,json_extract(d.json,'$.windowEnd') AS window_end,r.value AS revision_id FROM v1_feed_documents d CROSS JOIN json_each(d.json,'$.result.items') i CROSS JOIN json_each(i.value,'$.sourceIds') r WHERE d.kind='v3_window_results' AND r.type='text'
 UNION SELECT d.feed_id,d.id,json_extract(d.json,'$.windowEnd'),json_extract(s.value,'$.id') FROM v1_feed_documents d CROSS JOIN json_each(d.json,'$.result.skipped') s WHERE d.kind='v3_window_results' AND json_type(s.value,'$.id')='text'
 UNION SELECT d.feed_id,d.id,json_extract(d.json,'$.windowEnd'),r.value FROM v1_feed_documents d CROSS JOIN json_each(d.json,'$.result.omitted') i CROSS JOIN json_each(i.value,'$.sourceIds') r WHERE d.kind='v3_window_results' AND r.type='text'
 UNION SELECT d.feed_id,d.id,json_extract(d.json,'$.windowEnd'),r.value FROM v1_feed_documents d CROSS JOIN json_each(d.json,'$.result.dropped') i CROSS JOIN json_each(i.value,'$.sourceIds') r WHERE d.kind='v3_window_results' AND r.type='text';
-- JSON truthiness matches the existing JavaScript carry test, including retained legacy values.
CREATE VIEW IF NOT EXISTS v3_carry_projection AS
 SELECT t.feed_id,t.revision_id,t.result_id,t.window_end,EXISTS(
 SELECT 1 FROM json_each(d.json,'$.result.dropped') drop_item CROSS JOIN json_each(drop_item.value,'$.sourceIds') ref
 WHERE ref.type='text' AND ref.value=t.revision_id AND (
 json_type(drop_item.value,'$.carry') IN ('true','array','object') OR
 (json_type(drop_item.value,'$.carry') IN ('integer','real') AND json_extract(drop_item.value,'$.carry')!=0) OR
 (json_type(drop_item.value,'$.carry')='text' AND length(json_extract(drop_item.value,'$.carry'))>0))) AS carry
 FROM v3_carry_touches t CROSS JOIN v1_feed_documents d ON d.kind='v3_window_results' AND d.id=t.result_id AND d.feed_id=t.feed_id;
CREATE TRIGGER IF NOT EXISTS v3_carry_result_insert AFTER INSERT ON v1_feed_documents WHEN NEW.kind='v3_window_results' BEGIN
 SELECT CASE WHEN json_type(NEW.json,'$.windowEnd') IS NOT 'text' OR json_type(NEW.json,'$.result.items') IS NOT 'array' OR json_type(NEW.json,'$.result.skipped') IS NOT 'array' OR json_type(NEW.json,'$.result.omitted') IS NOT 'array' OR json_type(NEW.json,'$.result.dropped') IS NOT 'array'
 OR EXISTS(SELECT 1 FROM json_each(NEW.json,'$.result.items') i WHERE json_type(i.value,'$.sourceIds') IS NOT 'array')
 OR EXISTS(SELECT 1 FROM json_each(NEW.json,'$.result.omitted') i WHERE json_type(i.value,'$.sourceIds') IS NOT 'array')
 OR EXISTS(SELECT 1 FROM json_each(NEW.json,'$.result.dropped') i WHERE json_type(i.value,'$.sourceIds') IS NOT 'array')
 THEN RAISE(ABORT,'V3_CARRY_RESULT_SHAPE') END;
 INSERT INTO v3_carry_decisions SELECT * FROM v3_carry_projection WHERE result_id=NEW.id AND feed_id=NEW.feed_id;
 UPDATE v3_carry_index_state SET version=version+1 WHERE feed_id=NEW.feed_id;
END;
CREATE TRIGGER IF NOT EXISTS v3_carry_result_delete AFTER DELETE ON v1_feed_documents WHEN OLD.kind='v3_window_results' BEGIN
 DELETE FROM v3_carry_decisions WHERE result_id=OLD.id AND feed_id=OLD.feed_id;
 UPDATE v3_carry_index_state SET version=version+1 WHERE feed_id=OLD.feed_id;
END;
-- Pre-existing feeds deliberately remain unready until their bounded backfill completes.
CREATE TRIGGER IF NOT EXISTS v3_carry_new_feed AFTER INSERT ON v1_feeds BEGIN
 INSERT INTO v3_carry_index_state(feed_id,ready) VALUES(NEW.id,1);
END;
