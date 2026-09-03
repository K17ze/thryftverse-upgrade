-- Smart Sell policy domain: server-authoritative auto-negotiation policies
-- and an immutable decision log.
--
-- This migration introduces two tables:
--
-- 1. `smart_sell_policies` — one row per listing, carrying the seller's
--    floor price, policy version, lifecycle status (active/paused/cancelled),
--    and optimistic-concurrency version. The floor price is the seller's
--    irrevocable minimum — Smart Sell will never accept or counter below it.
--
-- 2. `smart_sell_decisions` — an append-only log of every auto-negotiation
--    decision the server makes on behalf of the seller. Each row records
--    the offer ID, the decision (accept/counter/decline/escalate), the
--    reason, the net-proceeds breakdown at decision time, and the policy
--    version that governed the decision. This is the audit trail.
--
-- Design principles:
-- - The seller's floor price is the single source of truth for negotiation
--   boundaries. Smart Sell never goes below it.
-- - Every decision is logged with a full net-proceeds breakdown so the
--   seller can audit exactly what happened and why.
-- - The policy can be paused instantly (status = 'paused') without deleting
--   it — the seller can resume later.
-- - Policy version is incremented on every update so decisions can reference
--   the exact policy version that governed them.
-- - Optimistic concurrency via version column prevents lost updates when
--   the seller and the decision worker race.
--
-- All DDL is idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ── 1. smart_sell_policies: per-listing auto-negotiation policy ──────────────
CREATE TABLE IF NOT EXISTS smart_sell_policies (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL UNIQUE,
  seller_id TEXT NOT NULL,

  -- Floor price in GBP — the seller's irrevocable minimum. Smart Sell will
  -- never accept or counter below this amount.
  floor_price_gbp NUMERIC(10, 2) NOT NULL CHECK (floor_price_gbp > 0),

  -- Original listing price at policy creation time, for reference.
  listing_price_gbp NUMERIC(10, 2) NOT NULL CHECK (listing_price_gbp > 0),

  -- Policy lifecycle: active -> paused -> active | cancelled
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),

  -- Monotonically increasing policy version. Incremented on every update.
  -- Decisions reference this version so the audit trail is precise.
  policy_version INTEGER NOT NULL DEFAULT 1,

  -- Optimistic concurrency version for safe concurrent updates.
  version INTEGER NOT NULL DEFAULT 1,

  -- Maximum number of counter-offer rounds Smart Sell will make before
  -- escalating to the seller. Default 3 (Poshmark-style: try a few rounds,
  -- then hand back to the human).
  max_counter_rounds INTEGER NOT NULL DEFAULT 3 CHECK (max_counter_rounds >= 0 AND max_counter_rounds <= 10),

  -- Counter strategy: 'firm' (always counter at floor) or 'gradual'
  -- (counter between current offer and floor, moving toward floor).
  counter_strategy TEXT NOT NULL DEFAULT 'gradual'
    CHECK (counter_strategy IN ('firm', 'gradual')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_smart_sell_policies_seller
  ON smart_sell_policies(seller_id, status);

CREATE INDEX IF NOT EXISTS idx_smart_sell_policies_active
  ON smart_sell_policies(status)
  WHERE status = 'active';

-- ── 2. smart_sell_decisions: immutable auto-negotiation audit log ────────────
CREATE TABLE IF NOT EXISTS smart_sell_decisions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES smart_sell_policies(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,

  -- The decision the server made on behalf of the seller.
  -- 'accept'    — offer >= floor, accepted automatically
  -- 'counter'   — offer < floor, counter-offer sent
  -- 'decline'   — offer < floor and max rounds reached, declined
  -- 'escalate'  — could not reach a deal, escalated to seller for manual review
  decision TEXT NOT NULL
    CHECK (decision IN ('accept', 'counter', 'decline', 'escalate')),

  -- Human-readable reason for the decision, e.g. "Offer meets floor price"
  -- or "Below floor, countering at floor" or "Max rounds reached, escalating".
  reason TEXT NOT NULL,

  -- The offer amount that triggered this decision.
  offer_price_gbp NUMERIC(10, 2) NOT NULL,

  -- The counter-offer amount sent (if decision = 'counter'), else NULL.
  counter_price_gbp NUMERIC(10, 2),

  -- Net-proceeds breakdown at decision time — the seller sees exactly what
  -- they would receive if the deal closes at the accepted/countered price.
  -- This is the fee transparency layer.
  net_proceeds_gbp NUMERIC(10, 2) NOT NULL,
  platform_fee_gbp NUMERIC(10, 2) NOT NULL,
  gross_sale_gbp NUMERIC(10, 2) NOT NULL,

  -- The policy version that governed this decision.
  policy_version INTEGER NOT NULL,

  -- The counter-offer round this decision was made in (0 = first response).
  counter_round INTEGER NOT NULL DEFAULT 0,

  -- Idempotency: one decision per offer per round.
  deduplication_key TEXT NOT NULL UNIQUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_sell_decisions_policy
  ON smart_sell_decisions(policy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_smart_sell_decisions_listing
  ON smart_sell_decisions(listing_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_smart_sell_decisions_seller
  ON smart_sell_decisions(seller_id, created_at DESC);

-- ── 3. listing_intelligence_runs: advisory suggestion audit log ─────────────
--
-- Stores each run of the listing intelligence service for auditability.
-- The candidates JSONB array carries field-level candidates with evidence
-- and abstention flags. This table is write-once: runs are never updated
-- or deleted.
CREATE TABLE IF NOT EXISTS listing_intelligence_runs (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  seller_id TEXT NOT NULL,
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_intel_runs_seller
  ON listing_intelligence_runs(seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_intel_runs_listing
  ON listing_intelligence_runs(listing_id, created_at DESC);
