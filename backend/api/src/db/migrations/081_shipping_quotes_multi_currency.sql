-- 081_shipping_quotes_multi_currency.sql
-- Shipping quotes: stop hardcoding GBP. Adds canonical ISO-4217 money columns
-- (amount_minor + currency_code + currency_exponent + money_registry_version)
-- to commerce_shipping_quotes so quotes can be persisted in any registry-backed
-- currency. The legacy price_gbp NUMERIC column is retained as a shadow write
-- for backward compatibility and rollback safety; it is no longer the
-- authoritative monetary boundary once amount_minor is populated.

ALTER TABLE commerce_shipping_quotes
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'GBP'
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS currency_exponent SMALLINT NOT NULL DEFAULT 2
    CHECK (currency_exponent BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS money_registry_version TEXT;

-- Backfill amount_minor from existing price_gbp rows. GBP has exponent 2,
-- so minor units = price_gbp * 100. Only rows that are exactly representable
-- at 2 decimal places are backfilled; the rest are left NULL rather than
-- silently reinterpreted, mirroring the canonical-money quarantine policy.
UPDATE commerce_shipping_quotes
SET
  amount_minor = (price_gbp * 100)::BIGINT,
  currency_code = UPPER(currency),
  currency_exponent = 2,
  money_registry_version = 'iso4217-2026-07'
WHERE amount_minor IS NULL
  AND UPPER(currency) = 'GBP'
  AND price_gbp > 0
  AND price_gbp = ROUND(price_gbp, 2)
  AND price_gbp * 100 <= 9000000000000000;

-- Backfill any remaining GBP rows with a zero price (price_gbp = 0 is allowed
-- by the legacy CHECK) so the canonical columns are always consistent for GBP.
UPDATE commerce_shipping_quotes
SET
  amount_minor = 0,
  currency_code = UPPER(currency),
  currency_exponent = 2,
  money_registry_version = 'iso4217-2026-07'
WHERE amount_minor IS NULL
  AND UPPER(currency) = 'GBP'
  AND price_gbp = 0;

ALTER TABLE commerce_shipping_quotes
  DROP CONSTRAINT IF EXISTS commerce_shipping_quotes_canonical_money_check;
ALTER TABLE commerce_shipping_quotes
  ADD CONSTRAINT commerce_shipping_quotes_canonical_money_check CHECK (
    amount_minor IS NULL
    OR (
      amount_minor BETWEEN 0 AND 9000000000000000
      AND currency_exponent BETWEEN 0 AND 3
      AND money_registry_version IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS commerce_shipping_quotes_currency_code_idx
  ON commerce_shipping_quotes (currency_code);
