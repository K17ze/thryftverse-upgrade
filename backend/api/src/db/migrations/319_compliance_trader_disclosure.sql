-- Migration 319: DSA Article 30 trader-disclosure columns on
-- user_compliance_profiles.
--
-- The public-profile handler (routes/users.ts) projects trader
-- classification and legal details from this table, but the columns it
-- reads were never migrated — every /users/:id/profile request threw
-- 42703 (column "trader_type" does not exist). This adds the columns the
-- route contract already expects.
--
-- trader_type vocabulary mirrors the projection logic and contract test:
--   'business' / 'trader'     → trader
--   'private' / 'individual'  → non_trader
--   NULL / anything else      → not classified
-- Legal-detail columns stay NULL until a verified KYC flow populates
-- them — the handler only discloses them for verified traders.

ALTER TABLE user_compliance_profiles
  ADD COLUMN IF NOT EXISTS trader_type TEXT
    CHECK (trader_type IS NULL OR trader_type IN ('business', 'trader', 'private', 'individual')),
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS registration_number TEXT,
  ADD COLUMN IF NOT EXISTS business_address TEXT,
  ADD COLUMN IF NOT EXISTS vat_number TEXT;
