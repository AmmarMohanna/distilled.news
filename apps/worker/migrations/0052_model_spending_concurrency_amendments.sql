-- Explicit operator amendments change concurrency only; base money/time grants remain immutable.
CREATE TABLE v1_model_spending_concurrency_amendments (
 id TEXT PRIMARY KEY,
 authorization_id TEXT NOT NULL REFERENCES v1_model_spending_authorizations(id),
 sequence INTEGER NOT NULL CHECK(sequence>0),
 max_concurrent_operations INTEGER NOT NULL CHECK(max_concurrent_operations>0),
 json TEXT NOT NULL CHECK(json_valid(json)) CHECK(json_extract(json,'$.id')=id AND json_extract(json,'$.authorizationId')=authorization_id AND json_extract(json,'$.sequence')=sequence AND json_extract(json,'$.maxConcurrentOperations')=max_concurrent_operations),
 UNIQUE(authorization_id,sequence)
);
CREATE TRIGGER v1_model_concurrency_amendment_no_update BEFORE UPDATE ON v1_model_spending_concurrency_amendments BEGIN SELECT RAISE(ABORT,'MODEL_CONCURRENCY_AMENDMENT_IMMUTABLE'); END;
CREATE TRIGGER v1_model_concurrency_amendment_no_delete BEFORE DELETE ON v1_model_spending_concurrency_amendments BEGIN SELECT RAISE(ABORT,'MODEL_CONCURRENCY_AMENDMENT_IMMUTABLE'); END;
