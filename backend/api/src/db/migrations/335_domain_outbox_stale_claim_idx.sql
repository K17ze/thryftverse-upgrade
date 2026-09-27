-- Stale-claim reaper support for the transactional domain outbox.
--
-- claimDomainOutboxBatch now reaps `processing` rows whose locked_at lease
-- has expired (worker crash between claim and complete/fail). This partial
-- index keeps that reaper a bounded index scan instead of a full table scan
-- as completed/dead history accumulates.

CREATE INDEX IF NOT EXISTS domain_outbox_processing_locked_idx
  ON domain_outbox (locked_at)
  WHERE status = 'processing';
