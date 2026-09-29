-- 341_coown_orders_time_in_force.sql
-- Persist the resting-order duration the placement command carries.
-- Until now POST /co-own/assets/:id/orders accepted timeInForce
-- ('GFD'|'GTC90') only to derive expires_at — the order row itself never
-- recorded it, so my-orders reads could never show Day/GTC again after
-- placement. A nullable column keeps historical rows honest: they get
-- NULL (unknown), not a fabricated duration.

ALTER TABLE coOwn_orders
  ADD COLUMN IF NOT EXISTS time_in_force TEXT;

ALTER TABLE coOwn_orders
  ADD CONSTRAINT coOwn_orders_time_in_force_check
  CHECK (time_in_force IS NULL OR time_in_force IN ('GFD', 'GTC90'));
