ALTER TABLE payment_history ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe ON payment_history(stripe_payment_intent_id);
