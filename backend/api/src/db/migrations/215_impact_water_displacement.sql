-- 215_impact_water_displacement.sql
-- Adds water consumption factors to emissions_factors and introduces
-- impact_config table for displacement rate and rebound effect.
--
-- Water factors sourced from Higg MSI v3.7 industry-average water
-- consumption per kg of material:
--   cotton    ~10,000 L/kg
--   polyester ~0 L/kg (petroleum-based)
--   wool      ~17,000 L/kg
--   leather   ~17,000 L/kg
--   denim     ~11,000 L/kg

-- (a) Add nullable water_l_per_kg column to emissions_factors.
--     Existing rows remain NULL; only materials with known water
--     footprints are backfilled below.
ALTER TABLE emissions_factors ADD COLUMN IF NOT EXISTS water_l_per_kg NUMERIC;

-- (b) Seed water factors for existing production rows.
UPDATE emissions_factors SET water_l_per_kg = 10000 WHERE id = 'ef_cotton_prod';
UPDATE emissions_factors SET water_l_per_kg = 0     WHERE id = 'ef_polyester_prod';
UPDATE emissions_factors SET water_l_per_kg = 17000 WHERE id = 'ef_wool_prod';
UPDATE emissions_factors SET water_l_per_kg = 17000 WHERE id = 'ef_leather_prod';
UPDATE emissions_factors SET water_l_per_kg = 11000 WHERE id = 'ef_denim_prod';

-- (c) Create impact_config table for displacement rate and rebound effect.
CREATE TABLE IF NOT EXISTS impact_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  source TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO impact_config (key, value, source) VALUES
  ('displacement_rate', 0.85, 'WRAP 2025 displacement methodology'),
  ('rebound_effect', 0.12, 'Vestiaire/Inuk 2025 consequential LCA')
ON CONFLICT (key) DO NOTHING;
