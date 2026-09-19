-- Rollback for migration 320.

ALTER TABLE storefronts
  DROP COLUMN IF EXISTS policies;
