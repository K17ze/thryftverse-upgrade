-- 097_seller_first_sale_review.sql
-- Seller first-sale review queue.
-- When a seller completes their first sale, the order is flagged for
-- manual review before escrow release. This catches fraudulent sellers
-- before they can withdraw funds.

CREATE TABLE IF NOT EXISTS seller_first_sale_reviews (
  id BIGSERIAL PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'escalated')),
  risk_score INT,
  review_notes TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS seller_first_sale_reviews_status_idx
  ON seller_first_sale_reviews (review_status, created_at DESC);

CREATE INDEX IF NOT EXISTS seller_first_sale_reviews_seller_idx
  ON seller_first_sale_reviews (seller_id);
