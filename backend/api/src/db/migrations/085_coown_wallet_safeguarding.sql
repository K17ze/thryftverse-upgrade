-- 085_coown_wallet_safeguarding.sql
-- Wallet safeguarding disclosure for Co-Own.
--
-- Closes research gap #5: "Safeguarded: false hardcoded". The backend
-- currently hardcodes safeguarded=false and safeguardingPartner=null
-- (index.ts ~line 25776). This migration adds the columns so the values
-- are backend-backed and can be substantiated rather than asserted.
--
-- The safeguarding arrangement describes how buyer funds/units are
-- protected (e.g. segregated wallet, third-party custodian). The
-- safeguarding_evidence_url links to the actual legal/operational
-- evidence so the "Safeguarded" badge is never asserted without proof.

ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS safeguarded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS safeguarding_partner TEXT,
  ADD COLUMN IF NOT EXISTS safeguarding_evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS safeguarding_terms_url TEXT;

-- Per-user wallet safeguarding profile. The wallet balance endpoint
-- (index.ts ~line 25776) currently hardcodes safeguarded=false; this
-- table makes it backend-backed so the frontend can substantiate the
-- "Safeguarded" badge with a partner name and evidence URL.
CREATE TABLE IF NOT EXISTS wallet_safeguarding_profile (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  safeguarded BOOLEAN NOT NULL DEFAULT FALSE,
  safeguarding_partner TEXT,
  safeguarding_evidence_url TEXT,
  safeguarding_terms_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill: existing users default to safeguarded=false (the honest
-- baseline — no safeguarding arrangement is assumed without evidence).
INSERT INTO wallet_safeguarding_profile (user_id, safeguarded)
SELECT id, FALSE FROM users
ON CONFLICT (user_id) DO NOTHING;

