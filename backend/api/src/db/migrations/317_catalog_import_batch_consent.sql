-- Migration 317: persist the consent version the seller agreed to when
-- creating a catalog import batch. The consentVersion is required at batch
-- creation (it covers the import's data handling attestations) but was
-- previously accepted and silently dropped — no column existed to hold it.
--
-- Existing batches get an empty consent_version: their consent was captured
-- at a point when no column recorded it, so an empty string is the honest
-- value rather than a fabricated version.

ALTER TABLE catalog_import_batches
  ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT '';
