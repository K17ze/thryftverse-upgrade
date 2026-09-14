-- 288_interactions_nullable_user.sql
--
-- POST /listings/:listingId/view accepts anonymous viewers and recorded
-- them under a synthetic 'anon_<ip>' user_id — but interactions.user_id
-- is NOT NULL REFERENCES users(id), so every anonymous view insert hit an
-- FK violation, was swallowed by the best-effort catch, and the endpoint
-- still returned recorded:true. Anonymous view analytics were dead while
-- claiming success.
--
-- Make user_id nullable so anonymous views record honestly for aggregate
-- counts. The FK still constrains non-NULL values, and the
-- interactions_user_idempotency_idx (user_id, idempotency_key) unique
-- index is unaffected — anonymous views generate fresh keys per call.

ALTER TABLE interactions
  ALTER COLUMN user_id DROP NOT NULL;
