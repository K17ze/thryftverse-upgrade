-- Migration 173: Emissions factors, user impact ledger, and listing impact fields
--
-- Backend impact service for net avoided emissions calculations (P3-2).
-- Provides a verified emissions factor database (DEFRA 2024 / Higg MSI v3.7),
-- a per-user impact ledger that records materialised avoided emissions on
-- order completion, and the listing columns needed to drive the calculator
-- (material composition and item weight).
--
-- All sustainability claims surfaced to users are derived from these verified
-- factors. When material or weight data is missing the calculator fails closed
-- (returns null) — no fabricated CO2 figures are ever produced.

-- ── Listing impact fields ───────────────────────────────────────────────
-- The impact calculator requires material composition and item weight. These
-- are nullable because legacy listings predate the impact service; the
-- calculator treats a null value as "data unavailable" and fails closed.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS material_composition TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10, 4) CHECK (weight_kg IS NULL OR weight_kg > 0);

-- ── Emissions factors ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emissions_factors (
  id TEXT PRIMARY KEY,
  factor_type TEXT NOT NULL CHECK (factor_type IN ('production', 'eol', 'transport', 'packaging')),
  material TEXT NOT NULL,
  co2e_kg_per_kg NUMERIC NOT NULL,
  source TEXT NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emissions_factors_type_material_idx ON emissions_factors (factor_type, material);

-- Seed verified emissions factors.
-- Material production & end-of-life factors: Higg MSI v3.7 (publicly available
-- reference values). Transport factors: DEFRA 2024 GHG Conversion Factors
-- (company reporting). Packaging factors: DEFRA 2024 average unit values.
-- All inserts are idempotent via ON CONFLICT DO NOTHING.

INSERT INTO emissions_factors (id, factor_type, material, co2e_kg_per_kg, source, effective_date) VALUES
  ('ef_cotton_prod',     'production',  'cotton',       15.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_cotton_eol',      'eol',         'cotton',        2.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_polyester_prod',  'production',  'polyester',     9.5,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_polyester_eol',   'eol',         'polyester',     1.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_wool_prod',       'production',  'wool',         28.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_wool_eol',        'eol',         'wool',          2.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_leather_prod',    'production',  'leather',      17.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_leather_eol',     'eol',         'leather',       1.5,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_denim_prod',      'production',  'denim',        20.0,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_denim_eol',       'eol',         'denim',         2.5,  'Higg MSI v3.7',              DATE '2024-01-01'),
  ('ef_air_freight',     'transport',   'air',           0.5,  'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01'),
  ('ef_road_freight',    'transport',   'road',          0.062,'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01'),
  ('ef_rail_freight',    'transport',   'rail',          0.022,'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01'),
  ('ef_sea_freight',     'transport',   'sea',           0.008,'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01'),
  ('ef_cardboard_box',   'packaging',   'cardboard',     0.5,  'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01'),
  ('ef_poly_mailer',     'packaging',   'poly_mailer',   0.1,  'DEFRA 2024 GHG Conversion Factors', DATE '2024-01-01')
ON CONFLICT (id) DO NOTHING;

-- ── User impact ledger ──────────────────────────────────────────────────
-- Records materialised net avoided emissions for each completed order. The
-- net figure is (production_avoided + eol_avoided) - (shipping + packaging).
-- A negative value is stored honestly — shipping can exceed the avoided
-- footprint for a heavy item shipped by air over a long distance.
CREATE TABLE IF NOT EXISTS user_impact_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  listing_id TEXT,
  co2e_avoided_kg NUMERIC NOT NULL,
  co2e_production_avoided_kg NUMERIC NOT NULL,
  co2e_eol_avoided_kg NUMERIC NOT NULL,
  co2e_shipping_kg NUMERIC NOT NULL,
  co2e_packaging_kg NUMERIC NOT NULL,
  methodology_version TEXT NOT NULL,
  factor_sources TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_impact_ledger_user_idx ON user_impact_ledger (user_id, created_at DESC);
