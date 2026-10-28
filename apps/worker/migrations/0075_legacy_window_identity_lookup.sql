-- Detect frozen legacy work without parsing every historical intent/plan.
CREATE INDEX IF NOT EXISTS v1_semantic_intent_budget
ON v1_feed_documents(feed_id,json_extract(json,'$.input.budgetKey'))
WHERE kind='semantic_intents';
CREATE INDEX IF NOT EXISTS v1_editorial_plan_window
ON v1_feed_documents(feed_id,json_extract(json,'$.window.start'),json_extract(json,'$.window.end'))
WHERE kind='editorial_plans';
