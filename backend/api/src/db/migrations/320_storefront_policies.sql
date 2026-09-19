-- Migration 320: seller-authored shop policies on storefronts.
--
-- policies is a JSONB bag with a fixed key set (shipping, returns,
-- additional) holding free text the seller writes in Edit Profile.
-- It is rendered on the profile About tabs; an absent/empty key means the
-- seller hasn't authored that policy and clients show the platform/trust
-- fallback copy instead of fabricated seller claims.
--
-- The object is replaced wholesale on PUT /storefronts/me (the key set is
-- small and closed; the zod schema rejects unknown keys).

ALTER TABLE storefronts
  ADD COLUMN IF NOT EXISTS policies JSONB NOT NULL DEFAULT '{}'::jsonb;
