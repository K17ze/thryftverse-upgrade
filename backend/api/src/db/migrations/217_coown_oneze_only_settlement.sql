-- Co-Own settlement mode: ONEZE only
-- The settlement engine already always uses 1ZE mg regardless of this column.
-- This migration constrains the schema to match the engine.

-- Update any existing non-ONEZE assets
UPDATE coOwn_assets SET settlement_mode = 'ONEZE' WHERE settlement_mode != 'ONEZE';

-- Constrain to ONEZE only
ALTER TABLE coOwn_assets
  DROP CONSTRAINT IF EXISTS coOwn_assets_settlement_mode_check;
ALTER TABLE coOwn_assets
  ADD CONSTRAINT coOwn_assets_settlement_mode_check
  CHECK (settlement_mode = 'ONEZE');
