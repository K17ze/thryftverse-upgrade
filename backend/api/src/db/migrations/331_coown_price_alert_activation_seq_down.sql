-- 331_coown_price_alert_activation_seq_down.sql
--
-- Revert SEP20-FIN-12: drop the per-activation sequence. Rows keep their
-- triggered_at/active state; only the dedup-scoping column is removed.

ALTER TABLE coown_price_alerts
  DROP COLUMN IF EXISTS activation_seq;
