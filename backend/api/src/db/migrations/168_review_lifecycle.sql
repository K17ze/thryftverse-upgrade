-- Migration 167 — Review lifecycle
--
-- Adds the full review lifecycle schema required for the marketplace reputation
-- analysis: publication state, reports, moderation, appeals, incentive
-- disclosures, aggregate snapshots, and integrity signals.
--
-- Implements gates 2, 3, 6, 7, 8, 14 from the marketplace reputation analysis:
--   gate 2  — publication state machine (published / pending_moderation / removed / restored)
--   gate 3  — incentive disclosure persistence
--   gate 6  — reproducible aggregate snapshots
--   gate 7  — user reporting of policy violations
--   gate 8  — moderation audit trail + appeals
--   gate 14 — integrity / fake-review risk signals
--
-- This migration is ADDITIVE only — no destructive changes to order_reviews.

-- ── 1. review_publication_state ──────────────────────────────────────────────
-- Append-only state log. Each state change creates a new row; the current
-- state of a review is the latest row by changed_at.
CREATE TABLE IF NOT EXISTS review_publication_state (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES order_reviews(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'published'
    CHECK (state IN ('published', 'pending_moderation', 'removed', 'restored')),
  state_reason TEXT,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_publication_state_review_idx
  ON review_publication_state (review_id, changed_at DESC);

-- ── 2. review_reports ────────────────────────────────────────────────────────
-- Users can report reviews for policy violations. One open/active report per
-- user per review is enforced by UNIQUE(review_id, reporter_id).
CREATE TABLE IF NOT EXISTS review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL
    CHECK (reason IN ('fake_or_incentivized', 'harmful_or_abusive', 'personal_data', 'spam', 'off_topic', 'other')),
  details TEXT CHECK (LENGTH(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'actioned', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(review_id, reporter_id)
);

CREATE INDEX IF NOT EXISTS review_reports_queue_idx
  ON review_reports (status, created_at);

-- ── 3. review_moderation_actions ─────────────────────────────────────────────
-- Immutable audit trail of moderation decisions.
CREATE TABLE IF NOT EXISTS review_moderation_actions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN ('remove', 'restore', 'escalate', 'warn_seller', 'dismiss_report')),
  reason TEXT NOT NULL,
  policy_reference TEXT,
  moderator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_moderation_actions_review_idx
  ON review_moderation_actions (review_id, created_at);

-- ── 4. review_appeals ────────────────────────────────────────────────────────
-- Sellers or reviewers can appeal moderation decisions.
CREATE TABLE IF NOT EXISTS review_appeals (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  appellant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  appealed_action_id TEXT NOT NULL REFERENCES review_moderation_actions(id) ON DELETE CASCADE,
  grounds TEXT NOT NULL
    CHECK (grounds IN ('factual_error', 'policy_misapplied', 'new_evidence', 'proportionality')),
  details TEXT CHECK (LENGTH(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'upheld', 'overturned', 'withdrawn')),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_rationale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_appeals_queue_idx
  ON review_appeals (status, created_at);

-- ── 5. review_incentive_disclosures ──────────────────────────────────────────
-- Persistent record of any incentive offered in connection with a review.
CREATE TABLE IF NOT EXISTS review_incentive_disclosures (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  incentive_type TEXT NOT NULL
    CHECK (incentive_type IN ('discount', 'cashback', 'free_item', 'loyalty_points', 'future_credit', 'other')),
  description TEXT NOT NULL,
  disclosed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disclosed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_incentive_disclosures_review_idx
  ON review_incentive_disclosures (review_id);

-- ── 6. review_aggregate_snapshots ────────────────────────────────────────────
-- Reproducible aggregate projections per seller. computation_hash is the
-- SHA256 of the input set so any snapshot can be independently re-derived.
CREATE TABLE IF NOT EXISTS review_aggregate_snapshots (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  rating_average NUMERIC(3,2) NOT NULL,
  distribution JSONB NOT NULL,
  eligible_review_count INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_watermark TIMESTAMPTZ NOT NULL,
  computation_hash TEXT NOT NULL,
  UNIQUE(seller_id, snapshot_version)
);

CREATE INDEX IF NOT EXISTS review_aggregate_snapshots_seller_idx
  ON review_aggregate_snapshots (seller_id, computed_at DESC);

-- ── 7. review_integrity_signals ──────────────────────────────────────────────
-- Risk assessment signals for fake-review detection. signal_value carries the
-- structured evidence; risk_score is a 0-100 normalized risk weight.
CREATE TABLE IF NOT EXISTS review_integrity_signals (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES order_reviews(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL
    CHECK (signal_type IN ('duplicate_text', 'linked_accounts', 'incentive_detected', 'velocity_anomaly', 'rating_inconsistency', 'device_fingerprint', 'ip_reputation', 'cluster_pattern')),
  signal_value JSONB NOT NULL,
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0.0
    CHECK (risk_score >= 0 AND risk_score <= 100),
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS review_integrity_signals_review_idx
  ON review_integrity_signals (review_id, signal_type);

CREATE INDEX IF NOT EXISTS review_integrity_signals_queue_idx
  ON review_integrity_signals (signal_type, risk_score DESC);
