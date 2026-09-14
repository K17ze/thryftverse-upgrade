-- 287_auction_second_chance_declines_down.sql

DROP INDEX IF EXISTS auctions_second_chance_deadline_idx;

ALTER TABLE auctions
  DROP COLUMN IF EXISTS second_chance_declined_ids;
