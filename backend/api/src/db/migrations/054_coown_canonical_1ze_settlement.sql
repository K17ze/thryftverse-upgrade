-- Canonical 1ZE settlement: add ONEZE as a settlement mode and make it
-- the default for new Co-Own assets. Existing assets retain their current
-- mode for backward compatibility, but the frontend now displays 1ZE as
-- the primary settlement unit regardless of the stored mode.

ALTER TABLE coOwn_assets
  DROP CONSTRAINT IF EXISTS coOwn_assets_settlement_mode_check;

ALTER TABLE coOwn_assets
  ADD CONSTRAINT coOwn_assets_settlement_mode_check
  CHECK (settlement_mode IN ('GBP', 'TVUSD', 'HYBRID', 'ONEZE'));

-- Default new assets to ONEZE settlement
ALTER TABLE coOwn_assets
  ALTER COLUMN settlement_mode SET DEFAULT 'ONEZE';
