-- Review media and seller responses — makes the UI truthful by persisting
-- what the frontend already sends (photoUrls) and adding the seller response
-- capability that the frontend already models.
--
-- Phase 0 contract-truth repair per the marketplace reputation analysis:
--   1. Review photos were uploaded then silently stripped by Zod (supportReviews.ts:46-49).
--   2. Seller response endpoint was modelled in reviewApi.ts but had no backend route.
--
-- This migration is additive — no destructive changes to order_reviews.

-- ── Review media ────────────────────────────────────────────────────────────
-- Stores photo URLs attached by the buyer at submission time.
-- position preserves the buyer's intended ordering.
-- moderation_state defaults to 'published' for the initial launch; a future
--   integrity worker can set 'pending' or 'removed' without schema change.
CREATE TABLE IF NOT EXISTS review_media (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  moderation_state TEXT NOT NULL DEFAULT 'published'
    CHECK (moderation_state IN ('published', 'pending', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_media_review_idx
  ON review_media (review_id, position);

-- ── Seller responses ────────────────────────────────────────────────────────
-- A seller may publish one public response per review.
-- The response is versioned: the current text lives in review_responses while
--   each edit creates an immutable row in review_response_revisions.
-- edit_until bounds the edit window (30 days from creation by default).
CREATE TABLE IF NOT EXISTS review_responses (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES order_reviews(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edit_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_responses_seller_idx
  ON review_responses (seller_id, created_at DESC);

-- ── Response revision history (immutable) ───────────────────────────────────
-- Every edit creates a new row. The current body in review_responses always
-- matches the latest revision. This supports audit and dispute resolution.
CREATE TABLE IF NOT EXISTS review_response_revisions (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES review_responses(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  change_reason TEXT NOT NULL DEFAULT 'initial'
    CHECK (change_reason IN ('initial', 'author_edit', 'redaction', 'restoration')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(response_id, version)
);

CREATE INDEX IF NOT EXISTS review_response_revisions_response_idx
  ON review_response_revisions (response_id, version DESC);
