-- P1 reconciliation sweeps: partial indexes backing the bounded scans.
--
-- reconcileStaleProviderSubmissions scans payment_intents stuck in
-- 'provider_submission_pending' past the TTL — a partial index on
-- updated_at keeps the periodic scan cheap on a hot table.
CREATE INDEX IF NOT EXISTS payment_intents_stale_submission_idx
  ON payment_intents (updated_at)
  WHERE status = 'provider_submission_pending';

-- sweepExpiredCheckoutReservations scans 'active' reservations ordered by
-- expires_at. listing_checkout_expiry_idx (migration 067) already covers
-- (expires_at) WHERE status='active'; this adds the order_id lookup used to
-- cancel the bound order in the same pass.
CREATE INDEX IF NOT EXISTS listing_checkout_reservation_order_idx
  ON listing_checkout_reservations (order_id)
  WHERE status = 'active';
