-- One deployment-wide daily allowance, shared by verification and ingestion.
-- Reservations are conservative maximum charges, not reported provider costs.
CREATE TABLE connector_daily_provider_budgets (
  day TEXT PRIMARY KEY,
  limit_usd REAL NOT NULL CHECK(limit_usd>=0),
  reserved_usd REAL NOT NULL DEFAULT 0 CHECK(reserved_usd>=0)
);
