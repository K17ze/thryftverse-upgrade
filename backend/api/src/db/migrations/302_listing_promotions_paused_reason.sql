-- 302_listing_promotions_paused_reason.sql
--
-- Machine-readable reason a promotion was paused.
--
-- The lazy daily-fee settlement (chargePromotionForToday) re-checks
-- serveability inside the promotion-row lock before posting a charge: a
-- promotion whose listing can no longer be bought (sold, risk_pending-held,
-- paused, deleted) or whose seller lost distribution (reach_state
-- 'limited'/'suspended') is flipped to 'paused' instead of being billed for
-- inventory it cannot serve. `paused_reason` records WHY:
--
--   NULL                  — seller-initiated pause (the /pause route)
--   'listing_unservable'  — listing missing, not 'active', or sold_at set
--   'seller_restricted'   — seller reach_state is 'limited' or 'suspended'
--
-- 'exhausted' remains a separate status reserved for insufficient payable
-- balance. Resuming clears the reason; ending a promotion keeps it for
-- audit.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE listing_promotions
  ADD COLUMN IF NOT EXISTS paused_reason TEXT;
