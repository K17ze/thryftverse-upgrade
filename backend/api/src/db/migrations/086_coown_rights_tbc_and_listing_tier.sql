-- 086_coown_rights_tbc_and_listing_tier.sql
-- Rights TBC metadata + explicit listing tiers.
--
-- Closes research gap #9: "TBC without timeline". Rights rows can now
-- carry a tbc_eta_date and tbc_reason so the frontend shows when the
-- answer is expected and why it's pending, rather than a bare "TBC".
--
-- Also introduces listing_tier on coOwn_assets: 'preview' (default for
-- new assets until rights are fully confirmed), 'listed' (tradeable),
-- 'badged' (tradeable + verification badge), 'delisted' (hidden).
-- This is the crypto/fintech pattern (explicit listing states) borrowed
-- from the research comparison — it makes the half-listed state honest.

ALTER TABLE coown_rights
  ADD COLUMN IF NOT EXISTS tbc_eta_date DATE,
  ADD COLUMN IF NOT EXISTS tbc_reason TEXT;

ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS listing_tier TEXT NOT NULL DEFAULT 'listed'
    CHECK (listing_tier IN ('preview', 'listed', 'badged', 'delisted'));

-- Backfill: existing assets are 'listed' (the default above handles
-- this via the column default, but be explicit for clarity).
UPDATE coOwn_assets SET listing_tier = 'listed' WHERE listing_tier IS NULL;

CREATE INDEX IF NOT EXISTS coOwn_assets_listing_tier_idx
  ON coOwn_assets (listing_tier, created_at DESC)
  WHERE listing_tier IN ('preview', 'listed', 'badged');
