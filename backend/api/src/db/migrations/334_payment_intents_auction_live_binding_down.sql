-- Rollback for 334_payment_intents_auction_live_binding.
-- Drops the one-live-intent-per-(auction, winner) guard.
DROP INDEX IF EXISTS payment_intents_auction_live_uidx;
