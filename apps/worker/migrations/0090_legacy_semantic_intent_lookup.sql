-- Reassessment recovery must inspect retained legacy operations, not parse
-- every large V3 editor/verifier input for a feed. Missing legacy kind markers
-- remain included through IS NOT, matching the canonical recovery predicate.
CREATE INDEX IF NOT EXISTS v1_legacy_semantic_intents ON v1_feed_documents(feed_id,id)
WHERE kind='semantic_intents' AND json_extract(json,'$.input.kind') IS NOT 'V3_EDITOR_VERIFIER';
