-- 285_return_case_requested_amount.sql
-- Refund depth: a buyer's return request may carry a requested refund amount
-- (partial refund). NULL means the buyer is requesting a full refund of the
-- order total — the common case — so existing rows need no backfill.
--
-- The requested amount is a claim, not a resolution: the authoritative refund
-- figure remains remedy_amount_gbp (agreed remedy) / refund_executions
-- (executed refund). requested_amount_gbp is validated against the order's
-- paid total at write time in routes/returns.ts.

ALTER TABLE return_cases
  ADD COLUMN IF NOT EXISTS requested_amount_gbp NUMERIC(10,2);
