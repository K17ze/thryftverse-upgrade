-- Rollback for migration 319.

ALTER TABLE user_compliance_profiles
  DROP COLUMN IF EXISTS trader_type,
  DROP COLUMN IF EXISTS contact_email,
  DROP COLUMN IF EXISTS registration_number,
  DROP COLUMN IF EXISTS business_address,
  DROP COLUMN IF EXISTS vat_number;
