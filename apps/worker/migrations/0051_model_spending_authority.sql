-- Account exposure is operational authorization, independent of Feed editorial policy.
CREATE TABLE v1_model_spending_authorizations (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, valid_from TEXT NOT NULL, valid_until TEXT NOT NULL, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE INDEX v1_model_spending_authorization_period ON v1_model_spending_authorizations(account_id,valid_from,valid_until);
CREATE TABLE v1_model_spending_reservations (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, authorization_id TEXT, token TEXT NOT NULL, model TEXT NOT NULL, feed_id TEXT NOT NULL, reserved_cost_usd REAL NOT NULL CHECK(reserved_cost_usd>=0), lease_until INTEGER NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL CHECK(json_valid(json)));
CREATE INDEX v1_model_spending_reservation_account ON v1_model_spending_reservations(account_id,created_at);
CREATE TABLE v1_model_spending_settlements (id TEXT PRIMARY KEY REFERENCES v1_model_spending_reservations(id), token TEXT NOT NULL, cost_usd REAL NOT NULL CHECK(cost_usd>=0), reported INTEGER NOT NULL CHECK(reported IN (0,1)));
CREATE TABLE v1_model_spending_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CONSTRAINT v1_model_spending_admission CHECK(valid=1));
CREATE TRIGGER v1_model_spending_authority_immutable BEFORE UPDATE ON v1_model_spending_authorizations BEGIN SELECT RAISE(ABORT,'MODEL_AUTHORITY_IMMUTABLE'); END;
CREATE TRIGGER v1_model_spending_reservation_immutable BEFORE UPDATE ON v1_model_spending_reservations BEGIN SELECT RAISE(ABORT,'MODEL_RESERVATION_IMMUTABLE'); END;
CREATE TRIGGER v1_model_spending_settlement_identity BEFORE UPDATE ON v1_model_spending_settlements WHEN OLD.id!=NEW.id OR OLD.token!=NEW.token OR OLD.reported=1 BEGIN SELECT RAISE(ABORT,'MODEL_SETTLEMENT_IMMUTABLE'); END;
