-- Enforce the global 20-unit policy on co-own orders.
-- Migration 011 added ≤20 caps to coOwn_assets, coOwn_holdings, and
-- coOwn_buyout_offers but missed coOwn_orders, which only had
-- CHECK (units > 0). A single order for 21 units against a 20-unit
-- asset would be accepted at the DB layer even though it violates
-- the global policy. The application layer rejects this, but the
-- database should enforce it independently so the commerce graph
-- stays constrained regardless of the writer.

UPDATE coOwn_orders
SET units = LEAST(units, 20)
WHERE units > 20;

ALTER TABLE coOwn_orders
  DROP CONSTRAINT IF EXISTS coOwn_orders_units_cap_check;

ALTER TABLE coOwn_orders
  ADD CONSTRAINT coOwn_orders_units_cap_check CHECK (units > 0 AND units <= 20);
