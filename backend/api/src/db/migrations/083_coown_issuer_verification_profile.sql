-- 083_coown_issuer_verification_profile.sql
-- Tiered issuer verification for Co-Own.
-- The frontend already has tiered verification (email/id/seller) in
-- listingDetailContract.ts; this table makes it backend-backed so the
-- "Verified" badge on a Co-Own issuer is evidenced, not asserted.
--
-- Closes research gap #4: "Verified badge without provenance".
-- The KYC infrastructure (kycProvider.ts, kyc_cases, kyc_verification_events)
-- already exists; this table is the Co-Own-specific projection that
-- records the issuer's current verification tier and links to the KYC case.

CREATE TABLE IF NOT EXISTS coown_issuer_verification_profile (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  verification_tier TEXT NOT NULL DEFAULT 'email'
    CHECK (verification_tier IN ('email', 'id', 'seller')),
  verification_tier_set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kyc_case_id TEXT,  -- links to kyc_cases.id when tier >= 'id'
  seller_standards_met BOOLEAN NOT NULL DEFAULT FALSE,
  seller_standards_reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-populate existing users at the 'email' tier (baseline).
INSERT INTO coown_issuer_verification_profile (user_id, verification_tier)
SELECT id, 'email' FROM users
ON CONFLICT (user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS coown_issuer_verification_tier_idx
  ON coown_issuer_verification_profile (verification_tier, updated_at DESC);
