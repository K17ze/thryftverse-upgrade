-- Live bidding idempotency and lot versioning.
--
-- The bid endpoint now accepts a client-supplied `clientBidId` for idempotent
-- retries and locks the current-lot row with `FOR UPDATE` before mutating it.
-- This migration extends the schema to support those semantics:
--
-- 1. Adds `client_bid_id` to `live_shopping_bids` plus a partial unique index
--    on `(bidder_id, client_bid_id)` so a retried bid from the same bidder
--    replays the original row instead of duplicating it. The index is partial:
--    legacy rows and bids placed without a client_bid_id are excluded so a
--    single NULL bucket does not violate uniqueness.
-- 2. Adds `status` and `rejection_code` to `live_shopping_bids` so a bid can
--    be recorded as pending/accepted/rejected/unknown with an optional
--    machine-readable rejection code, instead of every inserted row implying
--    acceptance.
-- 3. Adds `version` to `live_shopping_current_lots` for optimistic concurrency
--    on lot state transitions.
-- 4. Adds `status` to `live_shopping_current_lots` to model the lot lifecycle
--    (scheduled, open, closing, sold, passed, cancelled).
-- 5. Adds `opens_at` and `closes_at` to `live_shopping_current_lots` for
--    scheduled lot timing.
-- 6. Adds `high_bidder_id` and `winner_id` to `live_shopping_current_lots` to
--    track the running high bidder and the final winner of a lot.
-- 7. Adds a CHECK constraint on `live_shopping_sessions.status` to codify the
--    stream lifecycle vocabulary.
--
-- All ALTERs are idempotent (IF NOT EXISTS / DO blocks).

-- ── 1. live_shopping_bids: client_bid_id + partial unique index ──────────────
ALTER TABLE live_shopping_bids
  ADD COLUMN IF NOT EXISTS client_bid_id TEXT;

-- Partial unique index — only enforced when client_bid_id is present. Scoped
-- per bidder so two different bidders can never collide on the same id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_bids_client_bid_id
  ON live_shopping_bids (bidder_id, client_bid_id)
  WHERE client_bid_id IS NOT NULL;

-- ── 2. live_shopping_bids: status + rejection_code ───────────────────────────
ALTER TABLE live_shopping_bids
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'unknown')),
  ADD COLUMN IF NOT EXISTS rejection_code TEXT;

-- ── 3. live_shopping_current_lots: version for optimistic concurrency ────────
ALTER TABLE live_shopping_current_lots
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ── 4. live_shopping_current_lots: status lifecycle ──────────────────────────
ALTER TABLE live_shopping_current_lots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('scheduled', 'open', 'closing', 'sold', 'passed', 'cancelled'));

-- ── 5. live_shopping_current_lots: opens_at + closes_at ──────────────────────
ALTER TABLE live_shopping_current_lots
  ADD COLUMN IF NOT EXISTS opens_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

-- ── 6. live_shopping_current_lots: high_bidder_id + winner_id ────────────────
ALTER TABLE live_shopping_current_lots
  ADD COLUMN IF NOT EXISTS high_bidder_id UUID,
  ADD COLUMN IF NOT EXISTS winner_id UUID;

-- ── 7. live_shopping_sessions.status: codify lifecycle vocabulary ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_session_status'
      AND conrelid = 'live_shopping_sessions'::regclass
  ) THEN
    ALTER TABLE live_shopping_sessions
      ADD CONSTRAINT chk_session_status CHECK (
        status IN ('draft', 'backstage', 'live', 'ending', 'ended', 'failed')
      );
  END IF;
END;
$$;
