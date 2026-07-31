-- 096_payment_method_types.sql
-- Widen user_payment_methods.method_type to include wallet types
-- (Apple Pay, Google Pay) so they can be persisted and surfaced as
-- saved payment methods alongside cards and bank accounts.

ALTER TABLE user_payment_methods
  DROP CONSTRAINT IF EXISTS user_payment_methods_method_type_check;

ALTER TABLE user_payment_methods
  ADD CONSTRAINT user_payment_methods_method_type_check CHECK (
    method_type IN ('card', 'bank_account', 'apple_pay', 'google_pay', 'paypal', 'klarna', 'clearpay', 'affirm')
  );

-- Add Stripe payment method type column for wallet methods that map to
-- a Stripe payment_method (e.g., Apple Pay maps to a card PM with
-- wallet.type = 'apple_pay').
ALTER TABLE user_payment_methods
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
  ADD COLUMN IF NOT EXISTS wallet_type TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS last4 TEXT,
  ADD COLUMN IF NOT EXISTS display_label TEXT;

CREATE INDEX IF NOT EXISTS user_payment_methods_stripe_pm_idx
  ON user_payment_methods (stripe_payment_method_id)
  WHERE stripe_payment_method_id IS NOT NULL;
