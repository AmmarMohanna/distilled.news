-- Separate technical provider admission. No grant, account cap or historical receipt changes.
CREATE TABLE v1_model_provider_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT v1_model_provider_admission CHECK(valid=1));
CREATE INDEX v1_model_reservation_provider_time ON v1_model_spending_reservations(model,created_at);
