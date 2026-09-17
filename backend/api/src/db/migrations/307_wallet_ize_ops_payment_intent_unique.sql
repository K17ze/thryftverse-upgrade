-- 307_wallet_ize_ops_payment_intent_unique.sql
--
-- POST /wallet/1ze/mint validates a settled wallet_topup payment intent but
-- never consumed it: replaying the same paymentIntentId minted (and wallet-
-- credited) 1ZE again. This partial unique index makes the payment intent a
-- single-use funding source — the second insert hits 23505 and the route
-- replays the committed operation instead of double-minting.
--
-- Partial (payment_intent_id IS NOT NULL) because burn operations and
-- non-funded mints legitimately carry a NULL intent.

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ize_operations_payment_intent_uidx
  ON wallet_ize_operations (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;
