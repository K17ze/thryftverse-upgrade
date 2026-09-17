-- 290_holiday_mode_until.sql
--
-- Holiday mode (holiday_mode, migration 049) was cosmetic: the away state
-- rendered on profiles but commerce never consulted it — buyers could check
-- out and send offers against a shop the product told them was "paused".
--
-- This column adds the seller-declared return date so the away state is
-- honest end-to-end:
--   - The public away projection and commerce gates treat a seller as away
--     only while holiday_mode is on AND (until is NULL OR until > NOW()).
--     A stated return date therefore auto-expires the pause — the seller
--     cannot stay "away" past the date they published.
--   - PATCH /users/me/preferences accepts holidayModeUntil; the buyer-facing
--     surfaces render "back on {date}" only when a real date exists.
--
-- Nullable by design: holiday mode without a declared return date is a valid
-- open-ended pause (Vinted-style). No default, no backfill — existing
-- holiday-mode sellers have no declared return date.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS holiday_mode_until TIMESTAMPTZ;

COMMENT ON COLUMN users.holiday_mode_until IS
  'Seller-declared holiday-mode return date. Effective away state = holiday_mode AND (until IS NULL OR until > NOW()).';
