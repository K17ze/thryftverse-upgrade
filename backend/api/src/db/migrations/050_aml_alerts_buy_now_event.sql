-- 050_aml_alerts_buy_now_event.sql
-- Allow 'buy_now' AML alert events emitted by the auction Buy Now flow.

ALTER TABLE aml_alerts
  DROP CONSTRAINT IF EXISTS aml_alerts_event_type_check;

ALTER TABLE aml_alerts
  ADD CONSTRAINT aml_alerts_event_type_check CHECK (
    event_type IN ('trade', 'bid', 'buy_now', 'deposit', 'withdrawal', 'transfer', 'manual')
  );
