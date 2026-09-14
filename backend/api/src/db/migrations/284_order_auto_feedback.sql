-- 284_order_auto_feedback.sql
--
-- Auto-feedback defaults (P0 gap): the marketplace previously had
-- voluntary-only reviews — a buyer who never reviewed left no feedback
-- artifact, and a seller who breached the dispatch SLA left no defect
-- record. This migration adds the persistence for both:
--
-- 1. order_reviews.is_auto / auto_reason — marks a platform-generated
--    review row. The row is still attributed to the order's buyer (the
--    reviewer of record) but is_auto=true tells every read surface to
--    render truthful copy ("Left automatically — no review submitted")
--    instead of presenting it as a buyer-authored review.
--
-- 2. order_sla_breaches — a defect record for a seller SLA breach
--    (currently: dispatch ship-by). Deliberately NOT a review row: a
--    fabricated negative review attributed to the buyer would be
--    untruthful. The flag feeds seller-performance surfaces and the order
--    timeline; UNIQUE(order_id, breach_type) makes the sweep idempotent.

ALTER TABLE order_reviews
  ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_reason TEXT;

ALTER TABLE order_reviews
  DROP CONSTRAINT IF EXISTS order_reviews_auto_reason_check;

ALTER TABLE order_reviews
  ADD CONSTRAINT order_reviews_auto_reason_check CHECK (
    auto_reason IS NULL OR auto_reason IN ('buyer_silence')
  );

-- Auto rows must always carry their reason; hand-written rows never do.
ALTER TABLE order_reviews
  DROP CONSTRAINT IF EXISTS order_reviews_auto_reason_consistency_check;

ALTER TABLE order_reviews
  ADD CONSTRAINT order_reviews_auto_reason_consistency_check CHECK (
    (is_auto = TRUE AND auto_reason IS NOT NULL)
    OR (is_auto = FALSE AND auto_reason IS NULL)
  );

CREATE TABLE IF NOT EXISTS order_sla_breaches (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  breach_type TEXT NOT NULL CHECK (breach_type IN ('dispatch_sla')),
  -- The effective deadline that was missed (accepted dispatch extensions
  -- are already folded in by the evaluator).
  ship_by TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_sla_breaches_order_type_idx
  ON order_sla_breaches (order_id, breach_type);

CREATE INDEX IF NOT EXISTS order_sla_breaches_seller_idx
  ON order_sla_breaches (seller_id, detected_at DESC);

-- Sweep support: orders past the feedback window are selected on
-- COALESCE(delivered_at, updated_at) within the two reviewable statuses.
CREATE INDEX IF NOT EXISTS orders_auto_feedback_due_idx
  ON orders (COALESCE(delivered_at, updated_at))
  WHERE status IN ('delivered', 'completed');
