-- Auction watchlist table
CREATE TABLE IF NOT EXISTS auction_watchlist (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auction_id TEXT NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, auction_id)
);

CREATE INDEX IF NOT EXISTS auction_watchlist_user_idx
  ON auction_watchlist (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS auction_watchlist_auction_idx
  ON auction_watchlist (auction_id);

-- Add settlement and cancellation columns to auctions
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS winner_bid_id BIGINT,
  ADD COLUMN IF NOT EXISTS winner_bidder_id TEXT,
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add idempotency key to auction_bids for duplicate prevention
ALTER TABLE auction_bids
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique constraint: one active idempotency key per bidder per auction
CREATE UNIQUE INDEX IF NOT EXISTS auction_bids_idempotency_idx
  ON auction_bids (auction_id, bidder_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add idempotency key to auctions for duplicate creation prevention
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS auctions_idempotency_idx
  ON auctions (seller_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add minimum increment column (optional, defaults to 0.01 if not set)
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS min_increment_gbp NUMERIC(12, 2) NOT NULL DEFAULT 0.01 CHECK (min_increment_gbp >= 0);

-- Index for cursor pagination on auctions discovery
CREATE INDEX IF NOT EXISTS auctions_discovery_ending_soon_idx
  ON auctions (ends_at ASC, id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS auctions_discovery_newest_idx
  ON auctions (created_at DESC, id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS auctions_discovery_most_bids_idx
  ON auctions (bid_count DESC, id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS auctions_discovery_price_low_idx
  ON auctions (current_bid_gbp ASC, id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS auctions_seller_idx
  ON auctions (seller_id, created_at DESC)
  WHERE cancelled_at IS NULL;

-- Index for my-bids lookup
CREATE INDEX IF NOT EXISTS auction_bids_bidder_idx
  ON auction_bids (bidder_id, created_at DESC, id);
