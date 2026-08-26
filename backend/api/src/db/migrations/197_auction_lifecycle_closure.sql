-- 197_auction_lifecycle_closure.sql
-- T20: Auctions Lifecycle — reserve enforcement, payment lifecycle, proxy
-- bidding, anti-sniping, seller cancellation, and realtime sequence.

-- Allow auctions to flow through a richer terminal lifecycle before final
-- settlement. 'ended' is kept for "time is up"; 'awaiting_payment' and
-- 'payment_expired' are new terminal-before-settlement states.
ALTER TABLE auctions
  DROP CONSTRAINT IF EXISTS auctions_status_check;

ALTER TABLE auctions
  ADD CONSTRAINT auctions_status_check
  CHECK (status IN ('upcoming', 'live', 'ended', 'awaiting_payment', 'reserve_not_met', 'payment_expired', 'second_chance_offered'));

-- Proxy bidding support: the maximum a bidder is willing to pay. The
-- actual bid amount is derived and never exceeds this. NULL means direct
-- (non-proxy) bid at the provided amount.
ALTER TABLE auction_bids
  ADD COLUMN IF NOT EXISTS max_bid_gbp NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS is_proxy BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure a proxy bid's max is at least as large as the committed amount.
ALTER TABLE auction_bids
  ADD CONSTRAINT auction_bids_proxy_max_check
  CHECK (
    is_proxy = FALSE
    OR (max_bid_gbp IS NOT NULL AND max_bid_gbp >= amount_gbp)
  );

-- Monotonic, auction-scoped sequence number for every bid/transition.
-- Populated by the trigger below; surfaced in realtime events so clients
-- can detect gaps and request a snapshot recovery.
ALTER TABLE auction_bids
  ADD COLUMN IF NOT EXISTS auction_sequence INTEGER;

-- Anti-sniping configuration per auction. NULLs are treated as disabled.
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS anti_sniping_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anti_sniping_extension_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS anti_sniping_max_extensions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extension_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anti_sniping_window_seconds INTEGER;

-- Payment deadline tracking. 'payment_deadline_at' is set when the auction
-- ends above reserve (status = 'awaiting_payment').
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS second_chance_offered_to TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_method_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT;

-- Seller cancellation attribution.
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

-- Index on reserve price for settlement-sweep filtering.
CREATE INDEX IF NOT EXISTS auctions_reserve_price_idx
  ON auctions (reserve_price_gbp)
  WHERE reserve_price_gbp IS NOT NULL;

-- Index to help the sweep find auctions needing payment expiry/relist.
CREATE INDEX IF NOT EXISTS auctions_payment_deadline_idx
  ON auctions (payment_deadline_at)
  WHERE status = 'awaiting_payment';

-- Index for proxy-bid winner resolution and sequence ordering.
CREATE INDEX IF NOT EXISTS auction_bids_proxy_max_idx
  ON auction_bids (auction_id, is_proxy, max_bid_gbp DESC, created_at ASC, id ASC)
  WHERE is_proxy = TRUE;

CREATE INDEX IF NOT EXISTS auction_bids_sequence_idx
  ON auction_bids (auction_id, auction_sequence);

-- Function: assign auction-scoped monotonic sequence numbers to bids.
CREATE OR REPLACE FUNCTION assign_auction_bid_sequence()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(auction_sequence), 0) + 1
    INTO next_seq
    FROM auction_bids
    WHERE auction_id = NEW.auction_id;

  NEW.auction_sequence := next_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger runs BEFORE INSERT so the sequence is atomic inside the row lock.
DROP TRIGGER IF EXISTS trg_auction_bid_sequence ON auction_bids;
CREATE TRIGGER trg_auction_bid_sequence
  BEFORE INSERT ON auction_bids
  FOR EACH ROW
  EXECUTE FUNCTION assign_auction_bid_sequence();
