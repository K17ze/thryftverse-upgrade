-- 1ZE internal gateway for marketplace checkout payments.
-- This is an internal gateway — no external API keys are needed.
-- It debits the buyer's 1ZE wallet atomically and credits escrow,
-- reusing the existing commerce escrow/release/refund pipeline.
INSERT INTO payment_gateways (id, display_name, gateway_type, is_active)
VALUES ('oneze_internal', '1ZE Wallet (Internal)', 'stablecoin', TRUE)
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  gateway_type = EXCLUDED.gateway_type,
  is_active = EXCLUDED.is_active;
