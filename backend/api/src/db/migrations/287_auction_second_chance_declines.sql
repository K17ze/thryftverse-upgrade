-- 287_auction_second_chance_declines.sql
--
-- Second-chance offer chains: previously only 'awaiting_payment' auctions
-- were swept, so a 'payment_expired' auction whose second-chance recipient
-- ignored or declined the offer stranded the listing 'paused' forever.
--
-- second_chance_declined_ids records every bidder who must not be offered
-- the item again — bidders who explicitly declined, recipients who let the
-- offer expire, and winners who failed to pay. The sweep pass for expired
-- second-chance offers advances to the next eligible bidder (excluding
-- these ids) or relists when no eligible bidder remains.

ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS second_chance_declined_ids TEXT[] NOT NULL DEFAULT '{}';

-- Index for the sweep pass that expires unanswered second-chance offers.
CREATE INDEX IF NOT EXISTS auctions_second_chance_deadline_idx
  ON auctions (payment_deadline_at)
  WHERE status = 'payment_expired' AND second_chance_offered_to IS NOT NULL;
