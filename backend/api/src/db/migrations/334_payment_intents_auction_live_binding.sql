-- 334_payment_intents_auction_live_binding.sql
--
-- The auction winner-pay route replays an existing live intent for the
-- (auction, winner) pair instead of minting a second one. That replay is a
-- read-then-act check: two concurrent POST /auctions/:id/payment requests
-- with different idempotency keys both observe "no intent" and both mint —
-- the second capture can never settle (paid_at guard) but money is taken
-- and must be refunded.
--
-- This partial unique index makes one live intent per (auction, winner) a
-- database invariant. The auction binding is written by a post-mint
-- metadata UPDATE (reserved keys are stripped from client metadata at the
-- /payments/intents ingest); the loser's UPDATE blocks on the in-flight
-- winner and then fails 23505 once it commits — the route retires the
-- unbound duplicate and replays the stored attempt.
--
-- Partial on (auctionId present AND status not terminal-failed): a 'failed'
-- or 'cancelled' attempt releases the pair so a retry can mint a fresh
-- intent; 'succeeded' stays indexed forever so a verified capture can never
-- be shadowed or duplicated.
--
-- Non-concurrent like 333's index: the expression set is small and this
-- runs inside the migration transaction.

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_auction_live_uidx
  ON payment_intents (
    (metadata->>'auctionId'),
    (metadata->>'winnerBidderId')
  )
  WHERE metadata->>'auctionId' IS NOT NULL
    AND metadata->>'winnerBidderId' IS NOT NULL
    AND status NOT IN ('failed', 'cancelled');
