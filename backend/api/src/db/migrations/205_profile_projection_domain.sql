-- Migration 204: Profile projection domain — trust evidence, storefront, away state.
--
-- Research report 24 identified a P0 contract failure: the public profile
-- aggregate expected by the mobile client ({ user, stats, viewer }) was never
-- returned by the backend. Privacy/block policy was not enforced, trust badges
-- were client-derived, featured listings had no backend owner, and media
-- mutation accepted arbitrary URLs.
--
-- This migration establishes the missing authoritative tables:
--   seller_trust_evidence  — evidence-backed trust claims with expiry/revocation
--   storefronts            — seller-authored shop config with draft/publish revisions
--   storefront_sections    — typed, rankable shop sections
--   storefront_featured_listings — server-owned pinned listing ranks
--
-- It also adds the `away_message` column to users (holiday_mode already exists
-- from migration 049) so the public profile can project an authoritative away
-- state without a separate table.
--
-- Design principles (AGENTS.md §11 — Truthful, §4 — Anti-AI):
--   - No badge without an evidence row. No evidence → no badge. Expired → no badge.
--   - Storefront sections are typed and constrained, not a free-form page builder.
--   - Featured listings are server-owned ranks with ownership/eligibility checks.
--   - Media binding uses the existing media_bindings table (target_type='profile').

-- ── away_message on users ─────────────────────────────────────────────
-- holiday_mode (boolean) already exists from migration 049. The away message
-- is the seller-authored text shown to buyers when holiday mode is active.
-- Stored on the user row because it is a single-valued account preference,
-- not a revisioned document.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS away_message TEXT;

-- ── seller_trust_evidence ─────────────────────────────────────────────
-- One row per evidence-backed trust claim. A badge is a public claim that
-- must be backed by a persisted evidence row with a qualification policy
-- version, measurement window, computed-at timestamp, and optional expiry.
--
-- No evidence row → no badge. Expired evidence → no badge. Revoked → no badge.
-- The public profile projection filters to active, non-expired evidence only.
--
-- Sensitive KYC details never enter this table — it records only the public
-- claim code, tier, and measurement metadata. Private KYC documents remain in
-- user_compliance_profiles (migration 009).

CREATE TABLE IF NOT EXISTS seller_trust_evidence (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The public claim this evidence supports.
  -- 'identity_checked'  — KYC process reached an eligible state (private docs stay private)
  -- 'trader_verified'   — marketplace trader/business classification verified (DSA Art 30)
  -- 'top_rated'         — seller performance programme: top performer tier
  -- 'fast_dispatch'     — seller performance programme: dispatch time threshold met
  -- 'responsive_seller' — seller performance programme: response rate/time threshold met
  code TEXT NOT NULL CHECK (code IN (
    'identity_checked', 'trader_verified', 'top_rated',
    'fast_dispatch', 'responsive_seller'
  )),

  -- Optional tier label within the code (e.g. 'performer', 'top_performer' for top_rated).
  tier TEXT,

  -- Measurement window for behavioural evidence (order/review based).
  -- Null for identity/trader evidence (point-in-time verification).
  measured_from TIMESTAMPTZ,
  measured_to TIMESTAMPTZ,

  -- When the evidence was computed/issued.
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the evidence expires. Null = does not expire (e.g. identity_checked).
  -- Behavioural evidence (top_rated, fast_dispatch, responsive_seller) must
  -- have an expiry — performance is a rolling window, not a permanent state.
  expires_at TIMESTAMPTZ,

  -- Policy version that qualified this evidence. Allows re-evaluation when
  -- thresholds change without silently invalidating old evidence.
  policy_version TEXT NOT NULL,

  -- Revocation state. 'active' → renders. 'revoked' → never renders.
  -- Revocation is an explicit administrative action, not the same as expiry.
  state TEXT NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'revoked')),

  -- Why the evidence was revoked, if applicable.
  revocation_reason TEXT,

  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One active evidence row per (seller, code). Re-qualification replaces the
  -- existing row rather than accumulating duplicates.
  UNIQUE (seller_id, code)
);

CREATE INDEX IF NOT EXISTS seller_trust_evidence_seller_idx
  ON seller_trust_evidence (seller_id, state);

CREATE INDEX IF NOT EXISTS seller_trust_evidence_active_idx
  ON seller_trust_evidence (seller_id, code)
  WHERE state = 'active';

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION update_seller_trust_evidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS seller_trust_evidence_updated_at_trigger ON seller_trust_evidence;
CREATE TRIGGER seller_trust_evidence_updated_at_trigger
  BEFORE UPDATE ON seller_trust_evidence
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_trust_evidence_updated_at();

-- ── storefronts ───────────────────────────────────────────────────────
-- Seller-authored shop configuration with draft/publish semantics.
-- One row per seller. revision is the optimistic-locking version counter:
-- every publish increments it. The client sends If-Match with the revision
-- it last saw; the server rejects stale publishes.
--
-- status: 'draft'    — owner is editing, not publicly visible as a storefront
--          'published' — live, public projection uses this config
--          'paused'   — temporarily taken down by the seller
--
-- The public profile projection includes storefront summary only when
-- status = 'published'. Draft/paused storefronts are owner-only.

CREATE TABLE IF NOT EXISTS storefronts (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'paused')),

  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),

  -- Seller-authored announcement shown at the top of the shop.
  announcement TEXT,

  -- Media asset references for cover and logo. These reference media_assets.id
  -- (migration 074), NOT arbitrary URLs. The mutation layer verifies ownership.
  cover_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  logo_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,

  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS storefronts_seller_idx
  ON storefronts (seller_id);

CREATE INDEX IF NOT EXISTS storefronts_published_idx
  ON storefronts (seller_id)
  WHERE status = 'published';

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION update_storefronts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS storefronts_updated_at_trigger ON storefronts;
CREATE TRIGGER storefronts_updated_at_trigger
  BEFORE UPDATE ON storefronts
  FOR EACH ROW
  EXECUTE FUNCTION update_storefronts_updated_at();

-- ── storefront_sections ───────────────────────────────────────────────
-- Typed, rankable sections within a storefront. The kind determines what
-- data the section contains and how the renderer displays it.
--
-- Kinds:
--   featured_listings — a curated list of listing IDs (ranked, owner-pinned)
--   collection        — a named collection of listings
--   new_arrivals      — dynamically populated from the seller's newest active listings
--   editorial_media   — a single media asset with an optional link
--   creator_work      — a curated list of creator content IDs (looks/posters)
--
-- Sections are ordered by sort_order. The public renderer respects this order.
-- A storefront may have at most 12 sections (enforced in the mutation layer).

CREATE TABLE IF NOT EXISTS storefront_sections (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,

  -- Section kind determines the data shape and renderer.
  kind TEXT NOT NULL CHECK (kind IN (
    'featured_listings', 'collection', 'new_arrivals',
    'editorial_media', 'creator_work'
  )),

  -- Human-readable section title shown in the shop.
  title TEXT NOT NULL,

  -- For 'new_arrivals': max number of listings to show.
  -- For other kinds: null.
  item_limit INTEGER CHECK (item_limit IS NULL OR item_limit > 0),

  -- For 'collection': references a seller collection (future table).
  -- For 'editorial_media': references a media_assets.id.
  -- Null for kinds that don't use a single reference.
  collection_ref TEXT,
  media_asset_ref TEXT REFERENCES media_assets(id) ON DELETE SET NULL,

  -- Optional safe link target for editorial_media sections.
  -- Validated to be an internal thryftverse route or https URL.
  link_url TEXT,
  link_label TEXT,

  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (storefront_id, sort_order)
);

CREATE INDEX IF NOT EXISTS storefront_sections_storefront_idx
  ON storefront_sections (storefront_id, sort_order);

-- Trigger: update updated_at
CREATE OR REPLACE FUNCTION update_storefront_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS storefront_sections_updated_at_trigger ON storefront_sections;
CREATE TRIGGER storefront_sections_updated_at_trigger
  BEFORE UPDATE ON storefront_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_storefront_sections_updated_at();

-- ── storefront_featured_listings ──────────────────────────────────────
-- Server-owned pinned listing ranks. This replaces the client-side
-- `listing.featured === true` sort that had no backend authority.
--
-- One row per (storefront, listing). The mutation layer verifies:
--   - the listing belongs to the storefront's seller
--   - the listing is active (not sold/removed/draft)
--   - the total featured count does not exceed the maximum (8)
--
-- Sold or moderated listings are removed automatically by a cleanup job
-- (or filtered at projection time) without corrupting the saved order.

CREATE TABLE IF NOT EXISTS storefront_featured_listings (
  id TEXT PRIMARY KEY,
  storefront_id TEXT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,

  -- Rank within the featured section. Lower = earlier. The mutation layer
  -- enforces a small maximum (8) and deduplicates listing IDs.
  rank INTEGER NOT NULL DEFAULT 0 CHECK (rank >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (storefront_id, listing_id),
  UNIQUE (storefront_id, rank)
);

CREATE INDEX IF NOT EXISTS storefront_featured_listings_storefront_idx
  ON storefront_featured_listings (storefront_id, rank);

-- ── Backfill: create storefront rows for existing sellers ─────────────
-- Every user with at least one active listing gets a draft storefront.
-- This is non-destructive: status='draft' means it is not publicly projected
-- until the seller publishes it.

INSERT INTO storefronts (id, seller_id, status, revision)
SELECT
  'storefront_' || u.id,
  u.id,
  'draft',
  0
FROM users u
WHERE EXISTS (
  SELECT 1 FROM listings l WHERE l.seller_id = u.id
)
ON CONFLICT (seller_id) DO NOTHING;

COMMENT ON TABLE seller_trust_evidence IS
  'Evidence-backed public trust claims. No evidence row → no badge. Expired/revoked → no badge.';
COMMENT ON TABLE storefronts IS
  'Seller-authored shop configuration with draft/publish revisions and optimistic locking.';
COMMENT ON TABLE storefront_sections IS
  'Typed, rankable sections within a storefront. Kind determines data shape and renderer.';
COMMENT ON TABLE storefront_featured_listings IS
  'Server-owned pinned listing ranks. Replaces client-side featured sort.';
