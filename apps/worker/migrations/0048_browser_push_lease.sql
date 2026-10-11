-- Fence late notification acknowledgements after a subscription change or lease takeover.
ALTER TABLE push_subscriptions ADD COLUMN lease_token TEXT;
-- Each subscription activation has a stable, non-secret receipt identity.
ALTER TABLE push_subscriptions ADD COLUMN notification_version TEXT;
