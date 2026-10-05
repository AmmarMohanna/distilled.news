-- Ownership persists across runtime flags and deployments. Disabling connectors cannot restart legacy polling.
ALTER TABLE sources ADD COLUMN collection_owner TEXT NOT NULL DEFAULT 'legacy' CHECK(collection_owner IN ('legacy','connector'));
CREATE TRIGGER connector_owner_changed AFTER UPDATE OF collection_owner ON sources WHEN NEW.collection_owner!=OLD.collection_owner BEGIN UPDATE v1_intake_scopes SET json=json_set(json,'$.enabled',json('false')),epoch=epoch+1 WHERE id=NEW.id; END;
