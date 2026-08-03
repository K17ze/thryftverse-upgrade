-- 107_dac7_tax_info.sql
-- DAC7 tax information storage for EU platform-to-seller reporting.
-- Stores TIN, tax residence country, self-declaration, and verification
-- status so the platform can generate annual DAC7 reports.

CREATE TABLE IF NOT EXISTS user_tax_info (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tin TEXT NOT NULL,
  tax_residence_country TEXT NOT NULL,
  is_eu_resident BOOLEAN NOT NULL DEFAULT FALSE,
  self_declared BOOLEAN NOT NULL DEFAULT FALSE,
  self_declared_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'declared'
    CHECK (status IN ('declared', 'verified', 'rejected', 'expired')),
  verified_at TIMESTAMPTZ,
  rejected_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_tax_info_country_idx
  ON user_tax_info (tax_residence_country);

CREATE INDEX IF NOT EXISTS user_tax_info_status_idx
  ON user_tax_info (status);

-- Add DAC7 completion flag to compliance profile
ALTER TABLE user_compliance_profiles
  ADD COLUMN IF NOT EXISTS dac7_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_compliance_profiles
  ADD COLUMN IF NOT EXISTS dac7_tin TEXT;

ALTER TABLE user_compliance_profiles
  ADD COLUMN IF NOT EXISTS dac7_tax_residence_country TEXT;
