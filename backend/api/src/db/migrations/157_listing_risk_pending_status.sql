-- 157_listing_risk_pending_status.sql
--
-- FR-03: Extend the listings.status CHECK constraint to admit 'risk_pending'.
--
-- When the risk decision system returns step_up / manual_review / delay for a
-- listing publish, the listings route sets status = 'risk_pending' so the
-- listing is not public or search-indexable until risk clears. Previously
-- the code fell back to 'draft' because the CHECK constraint (migration 031)
-- only admitted draft|active|paused|sold|deleted. 'risk_pending' is a
-- distinct, auditable state — operators can see exactly which listings are
-- held by risk, not lumped with seller-authored drafts.
--
-- Idempotent: uses DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_status_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'sold', 'deleted', 'risk_pending'));

-- Backfill: any listing previously forced to 'draft' by the risk hold
-- (before this migration) stays as 'draft' — we do not retroactively
-- reclassify, since we cannot distinguish risk-held drafts from
-- seller-authored drafts after the fact.
