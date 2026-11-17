-- Exact source/item lookup for retained initial observations. No data rewrite.
CREATE INDEX IF NOT EXISTS v1_inputs_item_observed ON v1_inputs(
 feed_source_id,item_key,json_extract(json,'$.observation.observedAt'),id
);
