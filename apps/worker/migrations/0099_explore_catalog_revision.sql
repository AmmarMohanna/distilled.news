-- A constant-size revision for ranked public listing membership and ordering.
-- Publication bookkeeping and private-feed edits do not advance this counter.
CREATE TABLE explore_catalog_revision (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL CHECK (revision >= 1)
);
INSERT INTO explore_catalog_revision(singleton,revision) VALUES(1,1);

CREATE TRIGGER explore_catalog_feed_insert AFTER INSERT ON briefings
WHEN NEW.public_feed_enabled = 1 AND NEW.paused = 0
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER explore_catalog_feed_delete AFTER DELETE ON briefings
WHEN OLD.public_feed_enabled = 1 AND OLD.paused = 0
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER explore_catalog_feed_update AFTER UPDATE OF
  id,owner_account_id,slug,title,stars,created_at,public_feed_enabled,paused ON briefings
WHEN ((OLD.public_feed_enabled = 1 AND OLD.paused = 0) OR
      (NEW.public_feed_enabled = 1 AND NEW.paused = 0)) AND (
  OLD.id IS NOT NEW.id OR OLD.owner_account_id IS NOT NEW.owner_account_id OR
  OLD.slug IS NOT NEW.slug OR OLD.title IS NOT NEW.title OR
  OLD.stars IS NOT NEW.stars OR OLD.created_at IS NOT NEW.created_at OR
  OLD.public_feed_enabled IS NOT NEW.public_feed_enabled OR OLD.paused IS NOT NEW.paused)
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;

CREATE TRIGGER explore_catalog_account_update AFTER UPDATE OF username,disabled_at ON accounts
WHEN (OLD.username IS NOT NEW.username OR OLD.disabled_at IS NOT NEW.disabled_at)
  AND EXISTS(SELECT 1 FROM briefings WHERE owner_account_id=NEW.id AND public_feed_enabled=1 AND paused=0)
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;
