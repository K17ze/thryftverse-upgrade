-- 286_order_verification_requested.sql
--
-- Checkout item-verification add-on.
--
-- The buyer can request that the ordered item goes through the Thryft
-- authentication pipeline (lib/authenticationPipeline.ts — AI photo triage,
-- then expert/lab escalation by value tier). The backend exposes no
-- verification fee or SLA, so this is persisted as a request marker only —
-- no charge is added to the order total. POST /orders and
-- PATCH /orders/:orderId/checkout accept `verificationRequested`; the flag
-- is part of the idempotency request hash so a toggled request produces a
-- distinct order signature.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS verification_requested BOOLEAN NOT NULL DEFAULT FALSE;
