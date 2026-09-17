-- 307_wallet_ize_ops_payment_intent_unique_down.sql
--
-- Removes the single-use funding-source constraint on
-- wallet_ize_operations.payment_intent_id. Replays of a settled
-- wallet_topup intent will mint again (pre-307 behavior) — only roll back if
-- that is explicitly intended.

DROP INDEX IF EXISTS wallet_ize_operations_payment_intent_uidx;
