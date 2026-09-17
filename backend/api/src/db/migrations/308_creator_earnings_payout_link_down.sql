DROP INDEX IF EXISTS cee_related_payout_request_idx;
ALTER TABLE creator_earning_entries
  DROP COLUMN IF EXISTS related_payout_request_id;
