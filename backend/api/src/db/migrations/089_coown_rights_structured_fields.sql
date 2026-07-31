-- 089_coown_rights_structured_fields.sql
-- Closes GAP 3: Rights table lacks structured economic/voting/exit/fee rights.
--
-- The audit required "economic, voting, transfer, exit and fee rights"
-- as structured data, not just free-text summary_terms. This adds
-- explicit columns for each rights dimension.

ALTER TABLE coown_rights
  ADD COLUMN IF NOT EXISTS economic_rights TEXT
    CHECK (economic_rights IS NULL OR char_length(economic_rights) BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS voting_rights TEXT
    CHECK (voting_rights IS NULL OR char_length(voting_rights) BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS exit_rights TEXT
    CHECK (exit_rights IS NULL OR char_length(exit_rights) BETWEEN 5 AND 2000),
  ADD COLUMN IF NOT EXISTS fee_rights TEXT
    CHECK (fee_rights IS NULL OR char_length(fee_rights) BETWEEN 5 AND 2000);

COMMENT ON COLUMN coown_rights.economic_rights IS
  'Structured economic rights (revenue share, dividend, profit distribution).';
COMMENT ON COLUMN coown_rights.voting_rights IS
  'Structured voting rights (governance, board representation, consent rights).';
COMMENT ON COLUMN coown_rights.exit_rights IS
  'Structured exit rights (redemption, wind-up, drag-along, tag-along).';
COMMENT ON COLUMN coown_rights.fee_rights IS
  'Structured fee rights (management fee, carry, expense allocation).';
