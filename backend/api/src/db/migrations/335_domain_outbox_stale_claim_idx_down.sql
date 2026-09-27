-- Rollback for 335_domain_outbox_stale_claim_idx.
DROP INDEX IF EXISTS domain_outbox_processing_locked_idx;
