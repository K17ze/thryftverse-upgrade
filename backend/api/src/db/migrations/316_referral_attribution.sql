-- 316_referral_attribution.sql
-- Server-owned referral codes + signup attribution.
--
-- Previously the invite screen generated a deterministic "TV-XXXXXX" code
-- client-side and called referral-stats/referrals endpoints that did not
-- exist — a shared code did nothing. This migration makes referral codes
-- durable and attributions queryable.

CREATE TABLE IF NOT EXISTS user_referral_codes (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_referral_codes_code
  ON user_referral_codes (code);

CREATE TABLE IF NOT EXISTS user_referral_attributions (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_referral_attributions_referrer
  ON user_referral_attributions (referrer_user_id, created_at DESC);
