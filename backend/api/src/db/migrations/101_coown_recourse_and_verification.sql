-- 101_coown_recourse_and_verification.sql
-- Co-Own Recourse Agreement & Verification Demand System
--
-- Legal model: When a seller fractionalizes an asset on Co-Own, they
-- sign a recourse agreement that makes them personally liable for:
--   1. Safeguarding the physical asset
--   2. Proving authenticity on demand
--   3. Producing the physical item on demand
--   4. Paying back the total traded value if they fail any of the above
--
-- This is a consignment-with-recourse model. The seller (custodian)
-- retains physical possession but bears personal liability. If they
-- default, the platform triggers recourse: a debt is created, legal
-- recovery is pursued, and recovered funds are distributed to unit
-- holders.

-- ── Recourse agreements ─────────────────────────────────────────────
-- One per asset. Must be signed before the asset can be promoted from
-- 'preview' to 'listed'. Records the seller's personal liability.
CREATE TABLE IF NOT EXISTS coown_recourse_agreements (
  id              TEXT PRIMARY KEY,
  asset_id        TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  seller_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The legal document version the seller signed
  agreement_version   INTEGER NOT NULL DEFAULT 1,
  agreement_url       TEXT,
  -- E-signature metadata
  signed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_ip        TEXT,
  signature_user_agent TEXT,
  -- Liability calculation at signing time
  total_units_at_signing  INTEGER NOT NULL,
  unit_price_at_signing   NUMERIC(18,4) NOT NULL,
  max_liability_gbp       NUMERIC(18,2) NOT NULL,  -- total_units * unit_price
  -- Personal guarantee
  personal_guarantee      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Status lifecycle
  status                  TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'triggered', 'settled', 'disputed', 'void')),
  -- When recourse was triggered (if ever)
  triggered_at            TIMESTAMPTZ,
  triggered_reason        TEXT,
  -- When the debt was settled (if ever)
  settled_at              TIMESTAMPTZ,
  settled_amount_gbp      NUMERIC(18,2),
  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id)  -- one active agreement per asset
);

CREATE INDEX IF NOT EXISTS idx_coown_recourse_seller
  ON coown_recourse_agreements (seller_id, status);

CREATE INDEX IF NOT EXISTS idx_coown_recourse_asset
  ON coown_recourse_agreements (asset_id, status);

-- ── Verification demands ────────────────────────────────────────────
-- A buyer (who holds units) or the platform can demand that the seller
-- prove authenticity, possession, or condition. The seller has a
-- deadline to respond with evidence. Failure to respond triggers recourse.
CREATE TABLE IF NOT EXISTS coown_verification_demands (
  id              BIGSERIAL PRIMARY KEY,
  asset_id        TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  -- Who requested: a unit holder or 'platform' for automated audits
  requested_by    TEXT NOT NULL,  -- user_id or 'platform'
  -- What is being demanded
  demand_type     TEXT NOT NULL CHECK (
    demand_type IN ('authenticity', 'possession', 'condition', 'inspection')
  ),
  -- Deadline for seller response (default 14 days from creation)
  deadline        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  -- Status lifecycle
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'responded', 'compliant', 'failed', 'expired', 'withdrawn')
  ),
  -- Seller's response
  responded_at            TIMESTAMPTZ,
  evidence_url            TEXT,      -- photo/video/document URL
  evidence_notes          TEXT,
  -- Platform inspector review (if inspection was demanded)
  inspector_id            TEXT,
  inspector_report_url    TEXT,
  inspector_verdict       TEXT CHECK (
    inspector_verdict IN ('compliant', 'failed', 'inconclusive')
  ),
  inspector_reviewed_at   TIMESTAMPTZ,
  -- If this demand triggered recourse
  recourse_triggered      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_demand_asset
  ON coown_verification_demands (asset_id, status);

CREATE INDEX IF NOT EXISTS idx_verification_demand_seller
  ON coown_verification_demands (asset_id, status, created_at);

-- ── Recourse events (audit trail) ───────────────────────────────────
-- Append-only log of all recourse-related events for an asset.
-- SEC Rule 17Ad-7 pattern: non-rewriteable, audit-logged.
CREATE TABLE IF NOT EXISTS coown_recourse_events (
  id              BIGSERIAL PRIMARY KEY,
  asset_id        TEXT NOT NULL REFERENCES coOwn_assets(id) ON DELETE CASCADE,
  agreement_id    TEXT REFERENCES coown_recourse_agreements(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (
    event_type IN (
      'agreement_signed',
      'verification_demand_sent',
      'verification_demand_responded',
      'verification_demand_expired',
      'verification_compliant',
      'verification_failed',
      'recourse_triggered',
      'debt_created',
      'debt_recovery_filed',
      'debt_recovered',
      'debt_distributed',
      'agreement_settled',
      'agreement_disputed',
      'agreement_voided'
    )
  ),
  event_payload   JSONB NOT NULL DEFAULT '{}',
  -- The monetary impact of this event (if any)
  amount_gbp      NUMERIC(18,2),
  -- Who triggered the event
  triggered_by    TEXT,  -- user_id or 'platform' or 'system'
  visibility      TEXT NOT NULL DEFAULT 'public' CHECK (
    visibility IN ('public', 'issuer', 'internal')
  ),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recourse_events_asset
  ON coown_recourse_events (asset_id, created_at DESC);

-- ── Seller liability profile ────────────────────────────────────────
-- Aggregated view of a seller's total active liability across all
-- Co-Own assets. Used for risk assessment and display to buyers.
CREATE TABLE IF NOT EXISTS coown_seller_liability_profile (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Total liability across all active recourse agreements
  total_active_liability_gbp  NUMERIC(18,2) NOT NULL DEFAULT 0,
  active_agreement_count     INTEGER NOT NULL DEFAULT 0,
  -- History
  total_agreements_signed    INTEGER NOT NULL DEFAULT 0,
  total_recourse_triggered   INTEGER NOT NULL DEFAULT 0,
  total_debt_recovered_gbp   NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Risk tier (computed from history)
  risk_tier                  TEXT NOT NULL DEFAULT 'standard' CHECK (
    risk_tier IN ('standard', 'elevated', 'high', 'blocked')
  ),
  -- KYC background check status
  background_check_status    TEXT NOT NULL DEFAULT 'pending' CHECK (
    background_check_status IN ('pending', 'passed', 'failed', 'expired')
  ),
  background_check_completed_at  TIMESTAMPTZ,
  background_check_provider      TEXT,
  background_check_ref           TEXT,
  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Add recourse status to coOwn_assets ─────────────────────────────
-- Quick-access fields on the asset itself so the frontend doesn't
-- need a separate query for the common case.
ALTER TABLE coOwn_assets
  ADD COLUMN IF NOT EXISTS recourse_agreement_signed  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recourse_status            TEXT DEFAULT 'pending' CHECK (
    recourse_status IN ('pending', 'active', 'triggered', 'settled', 'disputed')
  ),
  ADD COLUMN IF NOT EXISTS total_traded_value_gbp     NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_verification_demands INTEGER NOT NULL DEFAULT 0;
