-- Rollback for migration 317.

ALTER TABLE catalog_import_batches
  DROP COLUMN IF EXISTS consent_version;
