-- Migration 231: Listing batch jobs — durable batch command receipts
--
-- P0-10: the seller-hub batch-command endpoint previously ran raw
-- `UPDATE listings SET status = 'deleted'` per row, bypassing the canonical
-- listing command service (search index removal, offer cancellation, audit,
-- cache invalidation). It also returned an ephemeral receipt with no server
-- side persistence, so a network timeout left the client with no way to
-- reconcile which items actually committed.
--
-- These two tables make batch commands durable and replay-safe:
--   listing_batch_jobs  — one row per batch request, keyed by idempotency_key
--   listing_batch_items — one row per listing in the batch, with per-item
--                         outcome (applied / rejected / conflict)
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT
-- EXISTS so re-running the migration is safe.

-- Optimistic concurrency column for listings. The canonical listing
-- command service (listingCommandService.ts) bumps this on every status
-- transition and checks an expectedVersion precondition when supplied.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS listing_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  command TEXT NOT NULL, -- 'delete' | 'pause' | 'resume'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_items INT NOT NULL DEFAULT 0,
  applied_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  conflict_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(idempotency_key)
);

CREATE TABLE IF NOT EXISTS listing_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_job_id UUID NOT NULL REFERENCES listing_batch_jobs(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, applied, rejected, conflict
  reason TEXT,
  current_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_batch_jobs_seller
  ON listing_batch_jobs(seller_id);
CREATE INDEX IF NOT EXISTS idx_listing_batch_items_batch
  ON listing_batch_items(batch_job_id);

COMMENT ON TABLE listing_batch_jobs IS
  'Durable record of a seller-hub batch listing command (delete/pause/resume), keyed by idempotency_key for safe replay.';
COMMENT ON TABLE listing_batch_items IS
  'Per-listing outcome of a batch command — applied, rejected, or conflict — so the UI can render truthful partial results after a timeout.';
