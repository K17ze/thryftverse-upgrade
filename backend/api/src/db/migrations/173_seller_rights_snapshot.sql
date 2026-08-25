-- 173_seller_rights_snapshot.sql
-- Gate 7: Persist seller capacity and versioned rights at purchase time.
-- This snapshot is immutable once written and serves as the authoritative
-- record of what the buyer was shown and what the seller agreed to at
-- the point of sale.

CREATE TABLE IF NOT EXISTS order_seller_rights_snapshot (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  -- Seller capacity at purchase time
  seller_tier TEXT NOT NULL DEFAULT 'standard',
  dispatch_sla_days INT NOT NULL DEFAULT 3,
  -- Return policy version at purchase time
  return_policy_version INT NOT NULL DEFAULT 1,
  return_policy_basis TEXT NOT NULL DEFAULT 'statutory',
  return_window_days INT NOT NULL DEFAULT 14,
  -- Buyer protection terms at purchase time
  buyer_protection_fee_gbp NUMERIC(10,2) NOT NULL DEFAULT 0,
  buyer_protection_version INT NOT NULL DEFAULT 1,
  -- Platform terms version
  platform_terms_version INT NOT NULL DEFAULT 1,
  -- Timestamps
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_seller_rights_seller
  ON order_seller_rights_snapshot(seller_id);
