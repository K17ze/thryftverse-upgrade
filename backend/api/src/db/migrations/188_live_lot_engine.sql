-- Versioned lot aggregate engine for live shopping auctions.
--
-- The existing `live_shopping_current_lots` table (migration 130, extended in
-- 186) remains as a projection/view of the *current* active lot for a session.
-- The new `live_lots` table introduced here is the authoritative versioned
-- aggregate: one row per lot per session, carrying the full lifecycle, running
-- high-bid state, pricing in canonical integer minor units, and an optimistic
-- concurrency version.
--
-- This migration:
--
-- 1. Creates `live_lots` — the versioned lot aggregate (one row per lot per
--    session) with lifecycle status, minor-unit pricing, denormalised high-bid
--    state, winner/order, and an optimistic-concurrency version.
-- 2. Creates `live_lot_snapshots` — an immutable listing snapshot captured at
--    lot open time so settlement and replay never depend on mutable listing
--    state.
-- 3. Creates `live_lot_events` — an append-only event log that records every
--    lot lifecycle transition with an event version and JSONB payload.
-- 4. Backfills `live_lots` from existing `live_shopping_current_lots` rows so
--    in-flight sessions keep working after the cutover.
-- 5. Adds a `lot_id` foreign key to `live_shopping_bids` so each bid can be
--    linked to its authoritative lot aggregate.
--
-- All DDL is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── 1. live_lots: versioned lot aggregate ────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_lots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES live_shopping_sessions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  lot_number INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,

  -- Lot lifecycle: scheduled -> open -> closing -> sold | passed | cancelled
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'open', 'closing', 'sold', 'passed', 'cancelled')),

  -- Pricing in integer minor units (pence) for canonical money handling
  currency TEXT NOT NULL DEFAULT 'GBP',
  start_price_minor BIGINT NOT NULL DEFAULT 0,
  reserve_price_minor BIGINT,
  min_increment_minor BIGINT NOT NULL DEFAULT 100,

  -- Running high bid state (denormalised from bid ledger for fast reads)
  high_bid_id TEXT,
  high_bid_minor BIGINT NOT NULL DEFAULT 0,
  high_bidder_id TEXT,

  -- Winner and order (set on close)
  winner_id TEXT,
  order_id TEXT,

  -- Version for optimistic concurrency
  version INTEGER NOT NULL DEFAULT 1,

  -- Timing
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- Anti-snipe extension count
  extension_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_live_lots_session_status
  ON live_lots (session_id, status);
CREATE INDEX IF NOT EXISTS idx_live_lots_listing
  ON live_lots (listing_id);

COMMENT ON TABLE live_lots IS
  'Authoritative versioned lot aggregate for a live shopping auction session.';
COMMENT ON COLUMN live_lots.status IS
  'Lot lifecycle: scheduled, open, closing, sold, passed, cancelled.';
COMMENT ON COLUMN live_lots.start_price_minor IS
  'Start price in integer minor units (pence) for canonical money handling.';
COMMENT ON COLUMN live_lots.high_bid_minor IS
  'Running high bid in minor units, denormalised from the bid ledger for fast reads.';
COMMENT ON COLUMN live_lots.version IS
  'Optimistic concurrency version; bumped on every lot state transition.';

-- ── 2. live_lot_snapshots: immutable listing snapshot at lot open time ───────
CREATE TABLE IF NOT EXISTS live_lot_snapshots (
  lot_id TEXT PRIMARY KEY REFERENCES live_lots(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  condition TEXT,
  category TEXT,
  brand TEXT,
  size TEXT,
  price_gbp NUMERIC(14, 2) NOT NULL,
  image_url TEXT,
  images JSONB,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE live_lot_snapshots IS
  'Immutable listing snapshot captured at lot open time for settlement and replay.';

-- ── 3. live_lot_events: append-only event log for lot lifecycle ─────────────
CREATE TABLE IF NOT EXISTS live_lot_events (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL REFERENCES live_lots(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('lot.scheduled', 'lot.opened', 'lot.bid_accepted', 'lot.bid_rejected',
                          'lot.closing', 'lot.closed', 'lot.sold', 'lot.passed', 'lot.cancelled',
                          'lot.extension', 'lot.settlement_started', 'lot.order_created',
                          'lot.payment_reserved', 'lot.payment_failed', 'lot.settlement_completed')),
  event_version INTEGER NOT NULL,
  actor_id TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_lot_events_lot_version
  ON live_lot_events (lot_id, event_version);
CREATE INDEX IF NOT EXISTS idx_live_lot_events_session
  ON live_lot_events (session_id, created_at DESC);

COMMENT ON TABLE live_lot_events IS
  'Append-only event log recording every lot lifecycle transition.';

-- ── 4. Backfill: migrate existing live_shopping_current_lots rows ───────────
-- Carry over the running high bid (current_price) as minor units and preserve
-- the optimistic-concurrency version and scheduled open time. Rows that already
-- exist for a (session_id, lot_number) pair are skipped so the migration is
-- safe to re-run.
INSERT INTO live_lots (id, session_id, listing_id, lot_number, status, start_price_minor, high_bid_minor, version, opens_at, updated_at)
SELECT
  'lot_' || session_id,
  session_id,
  listing_id,
  lot_number,
  CASE WHEN status = 'open' THEN 'open' ELSE 'scheduled' END,
  0,
  CAST(current_price * 100 AS BIGINT),
  version,
  opens_at,
  updated_at
FROM live_shopping_current_lots
ON CONFLICT (session_id, lot_number) DO NOTHING;

-- ── 5. live_shopping_bids: link bids to the authoritative lot aggregate ─────
ALTER TABLE live_shopping_bids
  ADD COLUMN IF NOT EXISTS lot_id TEXT REFERENCES live_lots(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_live_bids_lot
  ON live_shopping_bids (lot_id, created_at DESC);

COMMENT ON COLUMN live_shopping_bids.lot_id IS
  'Foreign key to the authoritative live_lots aggregate for this bid.';
