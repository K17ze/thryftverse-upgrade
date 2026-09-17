-- Migration 299: Listing batch 'edit' command — per-item applied-field receipts
--
-- The seller-hub batch-command endpoint gains an 'edit' command that applies
-- a validated field patch (the same whitelist as PATCH /listings/:listingId)
-- to each item. The per-item receipt reports which fields were actually
-- written; `detail` persists that list so an idempotent replay returns the
-- identical receipt instead of degrading to a bare applied/rejected status.

ALTER TABLE listing_batch_items
  ADD COLUMN IF NOT EXISTS detail JSONB;

COMMENT ON COLUMN listing_batch_items.detail IS
  'Per-item receipt detail. For the edit command: {"appliedFields": [...field keys written]}. NULL for lifecycle commands.';
