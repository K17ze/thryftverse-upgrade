-- 341_coown_orders_time_in_force_down.sql

ALTER TABLE coOwn_orders
  DROP CONSTRAINT IF EXISTS coOwn_orders_time_in_force_check;

ALTER TABLE coOwn_orders
  DROP COLUMN IF EXISTS time_in_force;
