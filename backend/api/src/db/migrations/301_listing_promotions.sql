-- 301_listing_promotions.sql
--
-- Flat-fee promoted listings ("Sponsored" slots in discovery/search).
--
-- Truthfulness contract (AGENTS.md §11):
--   * A promoted listing occupies a fixed slot blended into results — it is
--     NEVER a silent ranking boost. Server stamps `promoted: true` +
--     `disclosure: 'Sponsored'` on every paid unit.
--   * Billing is a flat daily fee, debited once per active day from the
--     seller's `seller_payable` ledger account (the same balance the Wallet
--     screen reads). Every debit is recorded in `promotion_charges` with the
--     paired ledger source_id, so spend reporting is auditable.
--   * When the seller's payable balance cannot cover the daily fee the
--     promotion flips to 'exhausted' and stops serving — it does not keep
--     delivering free impressions and it does not silently go negative.
--
-- listing_promotions   — the campaign (one active promotion per listing)
-- promotion_charges    — one row per active day actually billed
-- promotion_impressions— served-impression/click facts for stats reporting

CREATE TABLE IF NOT EXISTS listing_promotions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Flat daily fee in GBP minor units (pence). £1–£500/day bounds are also
  -- enforced at the API layer; the CHECK is the durable floor.
  daily_budget_minor INT NOT NULL CHECK (daily_budget_minor BETWEEN 100 AND 50000),
  -- Amount actually charged for `spend_day` (minor units). 0 until the first
  -- daily debit posts.
  daily_spend_minor INT NOT NULL DEFAULT 0 CHECK (daily_spend_minor >= 0),
  -- The UTC day `daily_spend_minor` covers. NULL = no day charged yet.
  spend_day DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'exhausted', 'ended')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Client-supplied replay key; UNIQUE per seller so a retried POST returns
  -- the original promotion instead of creating a duplicate.
  idempotency_key TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS listing_promotions_idempotency_idx
  ON listing_promotions (seller_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- At most one active promotion per listing — a listing can never occupy two
-- paid slots at once.
CREATE UNIQUE INDEX IF NOT EXISTS listing_promotions_active_listing_idx
  ON listing_promotions (listing_id)
  WHERE status = 'active';

-- Hot path for serving: active, in-window promotions.
CREATE INDEX IF NOT EXISTS listing_promotions_serving_idx
  ON listing_promotions (status, ends_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS listing_promotions_seller_idx
  ON listing_promotions (seller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promotion_charges (
  id TEXT PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES listing_promotions(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- UTC day this charge covers. UNIQUE with promotion_id makes the lazy
  -- daily debit idempotent across concurrent serving requests.
  charge_day DATE NOT NULL,
  amount_minor INT NOT NULL CHECK (amount_minor >= 0),
  -- 'charged' = ledger debit posted; 'insufficient_balance' = day claimed
  -- but the seller's payable balance could not cover it (promotion flips
  -- to 'exhausted').
  status TEXT NOT NULL CHECK (status IN ('charged', 'insufficient_balance')),
  -- ledger_entries.source_id of the paired debit/credit posting for audit.
  ledger_source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promotion_id, charge_day)
);

CREATE INDEX IF NOT EXISTS promotion_charges_seller_idx
  ON promotion_charges (seller_id, charge_day DESC);

CREATE TABLE IF NOT EXISTS promotion_impressions (
  id BIGSERIAL PRIMARY KEY,
  promotion_id TEXT NOT NULL REFERENCES listing_promotions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  -- NULL for anonymous viewers — never fabricated.
  viewer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  -- Surface that served the unit ('feed_home', 'feed_discover', 'search').
  surface TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promotion_impressions_promotion_idx
  ON promotion_impressions (promotion_id, event_type);

-- Promotion charges post to the shared ledger with source_type 'promotion'.
-- Extend the CHECK constraint (latest shape from migration 024) rather than
-- reusing 'adjustment', so ledger lines are self-describing.
ALTER TABLE ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_type_check;

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_source_type_check CHECK (
    source_type IN (
      'order_payment',
      'order_delivery',
      'payout',
      'refund',
      'adjustment',
      'mint',
      'burn',
      'coOwn_trade',
      'buyout',
      'reserve_reconcile',
      'transfer',
      'promotion'
    )
  );
