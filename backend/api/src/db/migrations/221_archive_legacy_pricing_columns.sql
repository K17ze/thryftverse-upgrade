-- Archive legacy token economics columns
-- These are no longer used by the at-par pricing engine
-- Kept for historical audit trail

-- Add audit table for legacy pricing parameters
CREATE TABLE IF NOT EXISTS oneze_legacy_pricing_archive (
  id BIGSERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  markup_bps INT,
  markdown_bps INT,
  cross_border_fee_bps INT,
  ppp_factor NUMERIC(8,6),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Copy current values to archive
INSERT INTO oneze_legacy_pricing_archive (country_code, markup_bps, markdown_bps, cross_border_fee_bps, ppp_factor)
SELECT country_code, markup_bps, markdown_bps, cross_border_fee_bps, ppp_factor
FROM oneze_country_pricing_profiles;

-- Drop old CHECK constraints BEFORE updating (they enforce token economics
-- bounds that the at-par model no longer uses; the UPDATE to 0 would violate them)
ALTER TABLE oneze_country_pricing_profiles DROP CONSTRAINT IF EXISTS oneze_country_pricing_profiles_markup_bps_check;
ALTER TABLE oneze_country_pricing_profiles DROP CONSTRAINT IF EXISTS oneze_country_pricing_profiles_markdown_bps_check;
ALTER TABLE oneze_country_pricing_profiles DROP CONSTRAINT IF EXISTS oneze_country_pricing_profiles_cross_border_fee_bps_check;
ALTER TABLE oneze_country_pricing_profiles DROP CONSTRAINT IF EXISTS oneze_country_pricing_profiles_ppp_factor_check;

-- Set old columns to defaults (don't drop, keep for audit)
UPDATE oneze_country_pricing_profiles SET markup_bps = 0, markdown_bps = 0, cross_border_fee_bps = 0, ppp_factor = 1.0;
