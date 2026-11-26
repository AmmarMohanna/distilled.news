CREATE TABLE channel_follows (
  channel_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  follower_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, follower_id),
  CHECK (channel_id <> follower_id)
);
CREATE INDEX channel_follows_follower ON channel_follows(follower_id);

CREATE TRIGGER explore_catalog_channel_follow_insert AFTER INSERT ON channel_follows
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER explore_catalog_channel_follow_delete AFTER DELETE ON channel_follows
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;
CREATE TRIGGER explore_catalog_channel_follower_status AFTER UPDATE OF disabled_at ON accounts
WHEN OLD.disabled_at IS NOT NEW.disabled_at
  AND EXISTS (SELECT 1 FROM channel_follows WHERE follower_id = NEW.id)
BEGIN
  UPDATE explore_catalog_revision SET revision=revision+1 WHERE singleton=1;
END;
