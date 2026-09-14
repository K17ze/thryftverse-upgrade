-- 293_holiday_mode_since.sql
--
-- Migration 290 added holiday_mode_until (the away window's end). The
-- dispatch-deadline shift in seller-hub then rebased every paid order to
-- max(paid_at, until) + ship_within_days — including orders paid BEFORE
-- the seller went away, whose contractual deadline (paid_at + handling)
-- was never excused. The docstring in lib/sellerAway.ts already promised
-- "pre-existing paid orders keep their paid_at + ship_within_days
-- dispatch deadline" but there was no column recording when the pause
-- began, so the window's start could not be tested.
--
-- This column is that anchor. PATCH /users/me/preferences stamps it when
-- the flag turns on (preserving an existing anchor on re-save) and clears
-- it when the flag turns off. The ship-by shift then applies only to
-- orders paid inside the away window: since <= paid_at <= until.
--
-- Nullable by design: sellers who already had holiday_mode on before this
-- column existed have no recorded start — the shift treats a NULL anchor
-- as "away since before any stored payment" (the pre-migration
-- behaviour), which is the conservative direction for legacy rows.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS holiday_mode_since TIMESTAMPTZ;

COMMENT ON COLUMN users.holiday_mode_since IS
  'Instant holiday_mode was turned on. Anchors the away window so the dispatch-deadline shift only applies to orders paid while the seller was actually away. NULL on legacy rows predating the column.';
