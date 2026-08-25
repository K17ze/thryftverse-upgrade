-- 174_return_cases.sql
-- Gate 8+9: Full returns domain with return basis model and state machine.
-- A return case is the authoritative record of a buyer's return request and
-- its resolution. It moves through a defined state machine from request to
-- remedy to appeal.

-- Return basis model (Gate 8):
-- statutory   — CMA Consumer Rights Act 2015 / DMCC statutory rights
-- protection  — ThryftVerse buyer protection (voluntary, contractually binding)
-- voluntary   — Seller's voluntary return policy (goodwill, above statutory)

CREATE TYPE return_basis AS ENUM ('statutory', 'protection', 'voluntary');

-- Return case state machine (Gate 9):
-- requested        → buyer submits return request
-- evidence_review  → seller/platform reviews evidence
-- approved         → return approved, reverse shipment initiated
-- rejected         → return rejected (buyer can appeal)
-- reverse_shipped  → return parcel is in transit back to seller
-- received         → seller confirms receipt of returned item
-- inspected        → item inspected, condition assessed
-- remedy_proposed  → remedy proposed (refund/replacement/repair)
-- remedy_accepted  → buyer accepts remedy
-- refund_confirmed → refund executed and confirmed
-- appealed         → buyer appeals rejection (escalates to platform)
-- closed           → case closed (terminal)

CREATE TYPE return_case_status AS ENUM (
  'requested',
  'evidence_review',
  'approved',
  'rejected',
  'reverse_shipped',
  'received',
  'inspected',
  'remedy_proposed',
  'remedy_accepted',
  'refund_confirmed',
  'appealed',
  'closed'
);

-- Remedy types
CREATE TYPE return_remedy AS ENUM (
  'full_refund',
  'partial_refund',
  'replacement',
  'repair',
  'reject'
);

CREATE TABLE IF NOT EXISTS return_cases (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  -- Return basis (Gate 8): statutory > protection > voluntary in priority
  basis return_basis NOT NULL DEFAULT 'statutory',
  -- State machine
  status return_case_status NOT NULL DEFAULT 'requested',
  -- Buyer's request
  reason TEXT NOT NULL,
  description TEXT,
  evidence_media_urls TEXT[] NOT NULL DEFAULT '{}',
  -- Return window deadline (server-derived from snapshot)
  return_window_deadline TIMESTAMPTZ,
  -- Reverse shipment
  return_carrier TEXT,
  return_tracking_number TEXT,
  return_label_url TEXT,
  -- Inspection
  inspection_notes TEXT,
  inspection_condition TEXT,
  -- Remedy
  proposed_remedy return_remedy,
  remedy_amount_gbp NUMERIC(10,2),
  -- Resolution
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  -- Appeal
  appeal_reason TEXT,
  appealed_at TIMESTAMPTZ,
  -- Operator override
  operator_id TEXT,
  operator_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_cases_order ON return_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_return_cases_buyer ON return_cases(buyer_id);
CREATE INDEX IF NOT EXISTS idx_return_cases_seller ON return_cases(seller_id);
CREATE INDEX IF NOT EXISTS idx_return_cases_status ON return_cases(status);

-- State transition audit log
CREATE TABLE IF NOT EXISTS return_case_events (
  id TEXT PRIMARY KEY DEFAULT ('rce_' || encode(gen_random_bytes(12), 'hex')),
  return_case_id TEXT NOT NULL REFERENCES return_cases(id) ON DELETE CASCADE,
  from_status return_case_status,
  to_status return_case_status NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_case_events_case
  ON return_case_events(return_case_id, created_at);
