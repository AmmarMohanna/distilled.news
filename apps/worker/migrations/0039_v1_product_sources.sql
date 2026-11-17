CREATE TABLE v1_source_catalog(id TEXT PRIMARY KEY,json TEXT NOT NULL CHECK(json_valid(json)));
CREATE TRIGGER v1_source_catalog_immutable BEFORE UPDATE ON v1_source_catalog
WHEN NEW.json!=OLD.json BEGIN SELECT RAISE(ABORT,'V1_SOURCE_IDENTITY'); END;
CREATE TABLE v1_product_bindings(feed_source_id TEXT PRIMARY KEY REFERENCES v1_intake_scopes(id),feed_id TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES v1_source_catalog(id),configuration TEXT NOT NULL);
CREATE TABLE v1_enrollment_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CONSTRAINT v1_enrollment_cas CHECK(valid=1));
