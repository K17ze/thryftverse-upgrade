CREATE TABLE IF NOT EXISTS stripe_payment_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider_customer_ref TEXT NOT NULL UNIQUE,
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_payment_methods
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'legacy_local',
  ADD COLUMN IF NOT EXISTS provider_customer_ref TEXT,
  ADD COLUMN IF NOT EXISTS provider_payment_method_ref TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'requires_recollection',
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS last4 TEXT,
  ADD COLUMN IF NOT EXISTS expiry_month SMALLINT,
  ADD COLUMN IF NOT EXISTS expiry_year SMALLINT,
  ADD COLUMN IF NOT EXISTS billing_country_hash TEXT,
  ADD COLUMN IF NOT EXISTS redisplay_consent TEXT,
  ADD COLUMN IF NOT EXISTS provider_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS detached_at TIMESTAMPTZ;

ALTER TABLE user_payment_methods
  DROP CONSTRAINT IF EXISTS user_payment_methods_status_check;

ALTER TABLE user_payment_methods
  ADD CONSTRAINT user_payment_methods_status_check
  CHECK (status IN ('active', 'detached', 'requires_recollection'));

ALTER TABLE user_payment_methods
  DROP CONSTRAINT IF EXISTS user_payment_methods_provider_ref_check;

ALTER TABLE user_payment_methods
  ADD CONSTRAINT user_payment_methods_provider_ref_check
  CHECK (
    status <> 'active'
    OR (
      provider <> 'legacy_local'
      AND provider_customer_ref IS NOT NULL
      AND provider_payment_method_ref IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_payment_methods_provider_ref_unique_idx
  ON user_payment_methods (provider, provider_payment_method_ref)
  WHERE provider_payment_method_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_payment_methods_active_user_idx
  ON user_payment_methods (user_id, is_default DESC, updated_at DESC)
  WHERE status = 'active';

UPDATE user_payment_methods
SET
  provider = 'legacy_local',
  status = 'requires_recollection',
  is_default = FALSE,
  updated_at = NOW()
WHERE provider_payment_method_ref IS NULL;

COMMENT ON TABLE stripe_payment_customers IS
  'Server-owned mapping between an authenticated Thryftverse user and a Stripe Customer.';

COMMENT ON COLUMN user_payment_methods.provider_payment_method_ref IS
  'Provider identifier only. Raw PAN, expiry input and CVC must never be stored by Thryftverse.';

COMMENT ON COLUMN user_payment_methods.status IS
  'Only active provider-bound rows may be offered at checkout. Legacy display-only rows require recollection.';
