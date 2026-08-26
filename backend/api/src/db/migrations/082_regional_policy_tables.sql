-- 082_regional_policy_tables.sql
-- Regional policy infrastructure: tax rules, category restrictions, shipping
-- zones and jurisdiction age rules. These tables externalise previously
-- hardcoded regional policy so the API can resolve tax treatment, prohibited
-- categories, shipping zones and minimum ages per country/cluster from the
-- database instead of constants. All tables are additive and idempotent.

-- Requires pgcrypto for gen_random_uuid(); the extension is enabled by the
-- canonical money / co-own migrations. Guarded so re-running is safe.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── tax_rules ────────────────────────────────────────────────────────
-- Per-country / per-category tax rates expressed in basis points
-- (2000 = 20%). category_id NULL acts as the default rate for the country.
CREATE TABLE IF NOT EXISTS tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  category_id UUID,
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  inclusive BOOLEAN NOT NULL DEFAULT TRUE,
  tax_type VARCHAR(20) NOT NULL DEFAULT 'vat'
    CHECK (tax_type IN ('vat', 'sales_tax', 'gst')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, category_id, effective_from)
);

CREATE INDEX IF NOT EXISTS tax_rules_country_code_idx
  ON tax_rules (country_code);

-- ── category_restrictions ────────────────────────────────────────────
-- Allow/deny list of listing categories per country cluster.
CREATE TABLE IF NOT EXISTS category_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_cluster VARCHAR(30) NOT NULL CHECK (country_cluster ~ '^[A-Z0-9_]+$'),
  category_id UUID NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_cluster, category_id)
);

-- ── shipping_zones ───────────────────────────────────────────────────
-- Named shipping zones grouping ISO country codes with an incoterm and the
-- carriers permitted to serve the zone.
CREATE TABLE IF NOT EXISTS shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_code VARCHAR(10) NOT NULL UNIQUE CHECK (zone_code ~ '^[A-Z0-9_]+$'),
  name TEXT NOT NULL,
  countries TEXT[] NOT NULL,
  incoterm VARCHAR(10) NOT NULL DEFAULT 'DDP'
    CHECK (incoterm IN ('DDP', 'DDU', 'DAP')),
  carrier_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  restricted_destinations TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── jurisdiction_age_rules ───────────────────────────────────────────
-- Minimum ages for commerce and co-ownership per country.
CREATE TABLE IF NOT EXISTS jurisdiction_age_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL UNIQUE CHECK (country_code ~ '^[A-Z]{2}$'),
  min_age_commerce INTEGER NOT NULL DEFAULT 18 CHECK (min_age_commerce BETWEEN 0 AND 120),
  min_age_coown INTEGER NOT NULL DEFAULT 18 CHECK (min_age_coown BETWEEN 0 AND 120),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed data ────────────────────────────────────────────────────────
-- Tax rules: UK 20% VAT inclusive, DE 19%, FR 20%, ES 21%, US 0 bps
-- (state-level sales tax handled separately). All effective from now.
INSERT INTO tax_rules (country_code, rate_bps, inclusive, tax_type)
VALUES
  ('GB', 2000, TRUE, 'vat'),
  ('DE', 1900, TRUE, 'vat'),
  ('FR', 2000, TRUE, 'vat'),
  ('ES', 2100, TRUE, 'vat'),
  ('US', 0,    FALSE, 'sales_tax')
ON CONFLICT (country_code, category_id, effective_from) DO NOTHING;

-- Shipping zones.
INSERT INTO shipping_zones (zone_code, name, countries, incoterm, carrier_ids, restricted_destinations)
VALUES
  (
    'UK_ZONE',
    'United Kingdom Zone',
    ARRAY['GB', 'IM', 'JE', 'GG'],
    'DDP',
    ARRAY['evri', 'royal_mail', 'dpd'],
    ARRAY[]::TEXT[]
  ),
  (
    'EU_ZONE',
    'European Union Zone',
    ARRAY['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'LU'],
    'DDP',
    ARRAY['dhl_eu', 'gls', 'dpd_eu'],
    ARRAY[]::TEXT[]
  ),
  (
    'US_ZONE',
    'United States Zone',
    ARRAY['US'],
    'DDP',
    ARRAY['usps', 'ups', 'fedex'],
    ARRAY[]::TEXT[]
  )
ON CONFLICT (zone_code) DO NOTHING;

-- Jurisdiction age rules for all seeded countries.
INSERT INTO jurisdiction_age_rules (country_code, min_age_commerce, min_age_coown)
VALUES
  ('GB', 18, 18),
  ('DE', 18, 18),
  ('FR', 18, 18),
  ('ES', 18, 18),
  ('US', 18, 18)
ON CONFLICT (country_code) DO UPDATE
SET
  min_age_commerce = EXCLUDED.min_age_commerce,
  min_age_coown = EXCLUDED.min_age_coown,
  updated_at = NOW();
