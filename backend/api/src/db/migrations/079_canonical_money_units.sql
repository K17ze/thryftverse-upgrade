-- Canonical money foundation.
-- Monetary truth is an ISO currency plus an integer minor amount. Legacy decimal
-- columns remain temporarily for shadow reads and rollback, but are no longer the
-- authoritative provider boundary.

CREATE TABLE IF NOT EXISTS money_currency_registry (
  currency_code TEXT PRIMARY KEY CHECK (currency_code ~ '^[A-Z]{3}$'),
  exponent SMALLINT NOT NULL CHECK (exponent BETWEEN 0 AND 3),
  registry_version TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO money_currency_registry (currency_code, exponent, registry_version)
VALUES
  ('AED', 2, 'iso4217-2026-07'), ('AUD', 2, 'iso4217-2026-07'),
  ('BHD', 3, 'iso4217-2026-07'), ('BIF', 0, 'iso4217-2026-07'),
  ('BRL', 2, 'iso4217-2026-07'), ('CAD', 2, 'iso4217-2026-07'),
  ('CHF', 2, 'iso4217-2026-07'), ('CLP', 0, 'iso4217-2026-07'),
  ('CNY', 2, 'iso4217-2026-07'), ('DKK', 2, 'iso4217-2026-07'),
  ('DJF', 0, 'iso4217-2026-07'), ('EUR', 2, 'iso4217-2026-07'),
  ('GBP', 2, 'iso4217-2026-07'), ('GNF', 0, 'iso4217-2026-07'),
  ('HKD', 2, 'iso4217-2026-07'), ('IDR', 2, 'iso4217-2026-07'),
  ('INR', 2, 'iso4217-2026-07'), ('JOD', 3, 'iso4217-2026-07'),
  ('JPY', 0, 'iso4217-2026-07'), ('KES', 2, 'iso4217-2026-07'),
  ('KMF', 0, 'iso4217-2026-07'), ('KRW', 0, 'iso4217-2026-07'),
  ('KWD', 3, 'iso4217-2026-07'), ('MGA', 2, 'iso4217-2026-07'),
  ('MXN', 2, 'iso4217-2026-07'), ('NGN', 2, 'iso4217-2026-07'),
  ('NOK', 2, 'iso4217-2026-07'), ('NZD', 2, 'iso4217-2026-07'),
  ('OMR', 3, 'iso4217-2026-07'), ('PLN', 2, 'iso4217-2026-07'),
  ('PYG', 0, 'iso4217-2026-07'), ('QAR', 2, 'iso4217-2026-07'),
  ('RWF', 0, 'iso4217-2026-07'), ('SAR', 2, 'iso4217-2026-07'),
  ('SEK', 2, 'iso4217-2026-07'), ('SGD', 2, 'iso4217-2026-07'),
  ('TND', 3, 'iso4217-2026-07'), ('UGX', 0, 'iso4217-2026-07'),
  ('USD', 2, 'iso4217-2026-07'), ('VND', 0, 'iso4217-2026-07'),
  ('VUV', 0, 'iso4217-2026-07'), ('XAF', 0, 'iso4217-2026-07'),
  ('XOF', 0, 'iso4217-2026-07'), ('XPF', 0, 'iso4217-2026-07'),
  ('ZAR', 2, 'iso4217-2026-07')
ON CONFLICT (currency_code) DO UPDATE
SET
  exponent = EXCLUDED.exponent,
  registry_version = EXCLUDED.registry_version,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS money_migration_quarantine (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  legacy_amount TEXT,
  legacy_currency TEXT,
  reason TEXT NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resolution_status IN ('pending', 'resolved', 'discarded')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (source_table, source_id)
);

ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount_unit TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB,
  ADD COLUMN IF NOT EXISTS money_quarantined BOOLEAN NOT NULL DEFAULT FALSE;

-- amount_gbp is only unambiguous when its companion currency is GBP. Rows whose
-- label and currency disagree are isolated for review rather than reinterpreted.
UPDATE payment_intents
SET
  amount_minor = (amount_gbp * 100)::BIGINT,
  currency_exponent = 2,
  money_registry_version = 'iso4217-2026-07'
WHERE amount_minor IS NULL
  AND UPPER(amount_currency) = 'GBP'
  AND amount_gbp > 0
  AND amount_gbp = ROUND(amount_gbp, 2)
  AND amount_gbp * 100 <= 9000000000000000;

UPDATE payment_intents
SET money_quarantined = TRUE
WHERE amount_minor IS NULL;

INSERT INTO money_migration_quarantine (
  source_table, source_id, legacy_amount, legacy_currency, reason
)
SELECT
  'payment_intents',
  id,
  amount_gbp::TEXT,
  amount_currency,
  CASE
    WHEN UPPER(amount_currency) <> 'GBP' THEN 'legacy_amount_gbp_currency_mismatch'
    ELSE 'legacy_amount_not_exactly_representable'
  END
FROM payment_intents
WHERE money_quarantined
ON CONFLICT (source_table, source_id) DO NOTHING;

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_canonical_money_check;
ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_canonical_money_check CHECK (
    (
      amount_minor BETWEEN 1 AND 9000000000000000
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
      AND money_quarantined = FALSE
    )
    OR (
      amount_minor IS NULL
      AND currency_exponent IS NULL
      AND money_quarantined = TRUE
    )
  );

ALTER TABLE payment_attempts
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS provider_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB;

UPDATE payment_attempts attempt
SET
  amount_minor = intent.amount_minor,
  currency_code = intent.amount_currency,
  currency_exponent = intent.currency_exponent,
  provider_fee_minor = CASE
    WHEN UPPER(intent.amount_currency) = 'GBP'
      THEN (attempt.provider_fee_gbp * 100)::BIGINT
    ELSE NULL
  END,
  money_registry_version = intent.money_registry_version
FROM payment_intents intent
WHERE attempt.intent_id = intent.id
  AND attempt.amount_minor IS NULL
  AND intent.amount_minor IS NOT NULL;

ALTER TABLE payment_attempts
  DROP CONSTRAINT IF EXISTS payment_attempts_canonical_money_check;
ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_canonical_money_check CHECK (
    amount_minor IS NULL
    OR (
      amount_minor BETWEEN 1 AND 9000000000000000
      AND currency_code ~ '^[A-Z]{3}$'
      AND currency_exponent BETWEEN 0 AND 3
      AND provider_fee_minor >= 0
      AND money_registry_version IS NOT NULL
    )
  );

ALTER TABLE payment_refunds
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS raw_provider_amount TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount_unit TEXT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB;

UPDATE payment_refunds refund
SET
  amount_minor = (refund.amount * POWER(10::NUMERIC, registry.exponent))::BIGINT,
  currency_exponent = registry.exponent,
  money_registry_version = registry.registry_version
FROM money_currency_registry registry
WHERE registry.currency_code = UPPER(refund.currency)
  AND refund.amount_minor IS NULL
  AND refund.amount > 0
  AND refund.amount * POWER(10::NUMERIC, registry.exponent)
      = TRUNC(refund.amount * POWER(10::NUMERIC, registry.exponent))
  AND refund.amount * POWER(10::NUMERIC, registry.exponent) <= 9000000000000000;

ALTER TABLE payment_refunds
  DROP CONSTRAINT IF EXISTS payment_refunds_canonical_money_check;
ALTER TABLE payment_refunds
  ADD CONSTRAINT payment_refunds_canonical_money_check CHECK (
    amount_minor IS NULL
    OR (
      amount_minor BETWEEN 1 AND 9000000000000000
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
    )
  );

ALTER TABLE payment_disputes
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS raw_provider_amount TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount_unit TEXT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB;

UPDATE payment_disputes dispute
SET
  amount_minor = (dispute.amount * POWER(10::NUMERIC, registry.exponent))::BIGINT,
  currency_exponent = registry.exponent,
  money_registry_version = registry.registry_version
FROM money_currency_registry registry
WHERE registry.currency_code = UPPER(dispute.currency)
  AND dispute.amount_minor IS NULL
  AND dispute.amount > 0
  AND dispute.amount * POWER(10::NUMERIC, registry.exponent)
      = TRUNC(dispute.amount * POWER(10::NUMERIC, registry.exponent))
  AND dispute.amount * POWER(10::NUMERIC, registry.exponent) <= 9000000000000000;

ALTER TABLE payment_disputes
  DROP CONSTRAINT IF EXISTS payment_disputes_canonical_money_check;
ALTER TABLE payment_disputes
  ADD CONSTRAINT payment_disputes_canonical_money_check CHECK (
    amount_minor IS NULL
    OR (
      amount_minor BETWEEN 1 AND 9000000000000000
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
    )
  );

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS money_quarantined BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE payout_requests
SET
  amount_minor = (amount_gbp * 100)::BIGINT,
  currency_exponent = 2,
  money_registry_version = 'iso4217-2026-07'
WHERE amount_minor IS NULL
  AND UPPER(amount_currency) = 'GBP'
  AND amount_gbp > 0
  AND amount_gbp = ROUND(amount_gbp, 2)
  AND amount_gbp * 100 <= 9000000000000000;

UPDATE payout_requests SET money_quarantined = TRUE WHERE amount_minor IS NULL;

INSERT INTO money_migration_quarantine (
  source_table, source_id, legacy_amount, legacy_currency, reason
)
SELECT
  'payout_requests',
  id,
  amount_gbp::TEXT,
  amount_currency,
  CASE
    WHEN UPPER(amount_currency) <> 'GBP' THEN 'legacy_amount_gbp_currency_mismatch'
    ELSE 'legacy_amount_not_exactly_representable'
  END
FROM payout_requests
WHERE money_quarantined
ON CONFLICT (source_table, source_id) DO NOTHING;

ALTER TABLE payout_requests
  DROP CONSTRAINT IF EXISTS payout_requests_canonical_money_check;
ALTER TABLE payout_requests
  ADD CONSTRAINT payout_requests_canonical_money_check CHECK (
    (
      amount_minor BETWEEN 1 AND 9000000000000000
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
      AND money_quarantined = FALSE
    )
    OR (
      amount_minor IS NULL
      AND currency_exponent IS NULL
      AND money_quarantined = TRUE
    )
  );

ALTER TABLE payment_webhook_events
  ADD COLUMN IF NOT EXISTS canonical_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS canonical_currency TEXT,
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT,
  ADD COLUMN IF NOT EXISTS raw_provider_amount TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount_unit TEXT,
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS money_conversion_trace JSONB;

ALTER TABLE payment_webhook_events
  DROP CONSTRAINT IF EXISTS payment_webhook_events_canonical_money_check;
ALTER TABLE payment_webhook_events
  ADD CONSTRAINT payment_webhook_events_canonical_money_check CHECK (
    canonical_amount_minor IS NULL
    OR (
      canonical_amount_minor BETWEEN 1 AND 9000000000000000
      AND canonical_currency ~ '^[A-Z]{3}$'
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS payment_intents_canonical_money_idx
  ON payment_intents (amount_currency, amount_minor)
  WHERE amount_minor IS NOT NULL;

ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS amount_base_units BIGINT,
  ADD COLUMN IF NOT EXISTS asset_code TEXT,
  ADD COLUMN IF NOT EXISTS asset_scale SMALLINT,
  ADD COLUMN IF NOT EXISTS asset_registry_version TEXT,
  ADD COLUMN IF NOT EXISTS amount_quarantined BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE ledger_entries entry
SET
  amount_base_units = CASE
    WHEN UPPER(entry.currency) = 'IZE' THEN (entry.amount * 1000)::BIGINT
    ELSE (entry.amount * POWER(10::NUMERIC, registry.exponent))::BIGINT
  END,
  asset_code = CASE WHEN UPPER(entry.currency) = 'IZE' THEN '1ZE' ELSE UPPER(entry.currency) END,
  asset_scale = CASE WHEN UPPER(entry.currency) = 'IZE' THEN 3 ELSE registry.exponent END,
  asset_registry_version = CASE
    WHEN UPPER(entry.currency) = 'IZE' THEN 'oneze-base-units-v1'
    ELSE registry.registry_version
  END
FROM money_currency_registry registry
WHERE entry.amount_base_units IS NULL
  AND (
    (UPPER(entry.currency) = 'IZE' AND registry.currency_code = 'GBP')
    OR registry.currency_code = UPPER(entry.currency)
  )
  AND entry.amount > 0
  AND (
    (UPPER(entry.currency) = 'IZE' AND entry.amount * 1000 = TRUNC(entry.amount * 1000))
    OR (
      UPPER(entry.currency) <> 'IZE'
      AND entry.amount * POWER(10::NUMERIC, registry.exponent)
        = TRUNC(entry.amount * POWER(10::NUMERIC, registry.exponent))
    )
  );

UPDATE ledger_entries
SET amount_quarantined = TRUE
WHERE amount_base_units IS NULL;

INSERT INTO money_migration_quarantine (
  source_table, source_id, legacy_amount, legacy_currency, reason
)
SELECT
  'ledger_entries',
  id::TEXT,
  amount::TEXT,
  currency,
  'ledger_amount_not_exactly_representable_in_asset_base_units'
FROM ledger_entries
WHERE amount_quarantined
ON CONFLICT (source_table, source_id) DO NOTHING;

ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_canonical_amount_check;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_canonical_amount_check CHECK (
    (
      amount_base_units BETWEEN 1 AND 9000000000000000
      AND asset_code ~ '^([A-Z]{3}|1ZE)$'
      AND asset_scale BETWEEN 0 AND 3
      AND asset_registry_version IS NOT NULL
      AND amount_quarantined = FALSE
    )
    OR (
      amount_base_units IS NULL
      AND asset_code IS NULL
      AND amount_quarantined = TRUE
    )
  );

CREATE INDEX IF NOT EXISTS money_migration_quarantine_pending_idx
  ON money_migration_quarantine (resolution_status, created_at)
  WHERE resolution_status = 'pending';
