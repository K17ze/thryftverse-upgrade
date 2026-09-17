-- Creator earnings ↔ payout request linkage.
--
-- Bank-destination creator payouts insert a 'payout' earning entry whose only
-- reference to the payout_request lives in free text
-- ("Bank payout request <id>"). Settlement then had no reliable way to flip
-- the 'held' sources to 'paid' (or release them on failure) — entries stayed
-- 'held' forever even after the payout settled.
--
-- This migration adds a first-class column, indexes it, and backfills from
-- the existing description convention.

ALTER TABLE creator_earning_entries
  ADD COLUMN IF NOT EXISTS related_payout_request_id TEXT;

CREATE INDEX IF NOT EXISTS cee_related_payout_request_idx
  ON creator_earning_entries (related_payout_request_id)
  WHERE related_payout_request_id IS NOT NULL;

-- Backfill: payout entries written before this column existed carried the
-- request id in description as 'Bank payout request <id>'.
UPDATE creator_earning_entries
SET related_payout_request_id = substring(description from 'Bank payout request (\S+)')
WHERE entry_type = 'payout'
  AND related_payout_request_id IS NULL
  AND description LIKE 'Bank payout request %';
