-- 082_coown_asset_trust_profile.sql
-- Co-Own trust profile: legal vehicle, custody, insurance, authenticity,
-- provenance, condition, appraisal, buyer protection.
--
-- Models the equity-market pattern (mandatory disclosure of the legal
-- wrapper, custody, and insurance before listing) for off-chain fractional
-- assets. All columns are nullable so existing assets don't break, but the
-- API gates new issuance on legal_vehicle_type (see POST /co-own/assets).
--
-- Closes research gaps: #1 (SPV disclosure), #2 (custody evidence), #5
-- (stale appraisal), #8 (insurance), and the "trust chips render from
-- fabricated fields" finding — the backend now owns these fields.

ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS legal_vehicle_type TEXT
    CHECK (legal_vehicle_type IS NULL OR legal_vehicle_type IN ('spv','llc','trust','series_llc','none')),
  ADD COLUMN IF NOT EXISTS legal_vehicle_name TEXT,
  ADD COLUMN IF NOT EXISTS legal_vehicle_jurisdiction TEXT,
  ADD COLUMN IF NOT EXISTS custodian_name TEXT,
  ADD COLUMN IF NOT EXISTS custodian_location TEXT,
  ADD COLUMN IF NOT EXISTS custody_insured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS custody_insurer TEXT,
  ADD COLUMN IF NOT EXISTS custody_policy_ref TEXT,
  ADD COLUMN IF NOT EXISTS custody_coverage_gbp NUMERIC(14, 2) CHECK (custody_coverage_gbp IS NULL OR custody_coverage_gbp >= 0),
  ADD COLUMN IF NOT EXISTS authenticity_status TEXT
    CHECK (authenticity_status IS NULL OR authenticity_status IN ('unverified','pending','verified')),
  ADD COLUMN IF NOT EXISTS authenticity_method TEXT,
  ADD COLUMN IF NOT EXISTS authenticity_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authenticity_verifier_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provenance TEXT,
  ADD COLUMN IF NOT EXISTS condition_grade TEXT,
  ADD COLUMN IF NOT EXISTS appraisal_value_gbp NUMERIC(14, 2) CHECK (appraisal_value_gbp IS NULL OR appraisal_value_gbp >= 0),
  ADD COLUMN IF NOT EXISTS appraisal_valued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appraisal_valuer TEXT,
  ADD COLUMN IF NOT EXISTS buyer_protection BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS buyer_protection_terms_url TEXT;

CREATE INDEX IF NOT EXISTS coOwn_assets_authenticity_idx
  ON coOwn_assets (authenticity_status)
  WHERE authenticity_status IS NOT NULL;

-- Append-only audit trail for trust-profile changes (SEC Rule 17Ad-7
-- pattern: non-rewriteable, audit-logged, identifies when/by-whom).
CREATE TABLE IF NOT EXISTS coown_asset_trust_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'trust_profile_created',
    'authenticity_updated',
    'custody_changed',
    'insurance_changed',
    'appraisal_refreshed',
    'vehicle_updated',
    'buyer_protection_changed'
  )),
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  previous_payload JSONB,
  new_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coown_asset_trust_events_asset_idx
  ON coown_asset_trust_events (asset_id, created_at DESC);
