-- Distinguish order terminal reasons: user cancellation vs system expiry
-- vs rejection. Before this migration, expiry set status = 'cancelled'
-- with no way to distinguish it from a user-initiated cancel in history
-- queries. The cancel_reason column makes the terminal cause explicit
-- so the frontend can show "Expired" vs "Cancelled" vs "Rejected"
-- without inferring from timestamps.

ALTER TABLE coOwn_orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT
  CHECK (cancel_reason IN ('user', 'expired', 'rejected', 'system'));

-- Backfill: existing cancelled orders have no recorded reason. Treat
-- them as user-initiated cancellations — the expiry sweeper only ran
-- inside a new-order transaction, so most legacy cancelled rows are
-- user cancels. This is a safe default; the column is informational.
UPDATE coOwn_orders
SET cancel_reason = 'user'
WHERE status = 'cancelled' AND cancel_reason IS NULL;

-- Backfill: rejected orders get the 'rejected' reason.
UPDATE coOwn_orders
SET cancel_reason = 'rejected'
WHERE status = 'rejected' AND cancel_reason IS NULL;

-- Index for efficient history queries that filter by reason.
CREATE INDEX IF NOT EXISTS coOwn_orders_cancel_reason_idx
  ON coOwn_orders (asset_id, cancel_reason, created_at DESC)
  WHERE cancel_reason IS NOT NULL;

COMMENT ON COLUMN coOwn_orders.cancel_reason IS
  'Terminal reason: user (user-initiated cancel), expired (time-in-force deadline), rejected (validation/risk), system (administrative). NULL for non-terminal orders.';
