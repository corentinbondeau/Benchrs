-- Fix push subscriptions upsert: add the unique constraint that
-- /api/notifications/subscribe relies on for its ON CONFLICT clause.
-- Without it the upsert fails and no subscription is ever stored,
-- so push notifications are never delivered.

DELETE FROM push_subscriptions a
USING push_subscriptions b
WHERE a.id > b.id AND a.user_id = b.user_id AND a.endpoint = b.endpoint;

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
